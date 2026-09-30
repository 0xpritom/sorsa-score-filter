let currentJob = {
  status: 'idle', // idle | running | done | stopped
  usernames: [],
  minScore: 0,
  onlyInfluencers: false,
  filteredUsernames: [],
  processedCount: 0,
  totalCount: 0,
  message: ''
};
let isProcessing = false;

// Setup alarms
chrome.alarms.create('keepAliveAndResume', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAliveAndResume') {
    stateLoadedPromise.then(() => {
      if (currentJob.status === 'running' && !isProcessing) {
        console.log("Alarm woke up service worker. Resuming job...");
        processJob();
      }
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  stateLoadedPromise.then(() => {
    if (currentJob.status === 'running' && !isProcessing) {
      processJob();
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  stateLoadedPromise.then(() => {
    if (currentJob.status === 'running' && !isProcessing) {
      processJob();
    }
  });
});

// Wait for state to load before handling any messages
let stateLoadedPromise = new Promise((resolve) => {
  chrome.storage.local.get(['sorsaJob'], (result) => {
    if (result.sorsaJob) {
      currentJob = result.sorsaJob;
      if (!Array.isArray(currentJob.filteredUsernames)) {
        currentJob.filteredUsernames = [];
      }
      if (currentJob.status === 'running' && !isProcessing) {
        processJob();
      }
    }
    resolve();
  });
});

async function saveState() {
  await chrome.storage.local.set({ sorsaJob: currentJob });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  stateLoadedPromise.then(() => {
    handleMessage(request, sender, sendResponse);
  });
  return true;
});

function handleMessage(request, sender, sendResponse) {
  if (request.action === 'startJob') {
    isProcessing = false;
    
    currentJob = {
      status: 'running',
      usernames: request.usernames || [],
      minScore: request.minScore !== undefined ? request.minScore : 0,
      onlyInfluencers: request.onlyInfluencers || false,
      filteredUsernames: [],
      processedCount: 0,
      totalCount: (request.usernames && request.usernames.length) || 0,
      message: 'Starting scan...'
    };
    
    saveState().then(() => {
      processJob();
      sendResponse({ success: true, totalCount: currentJob.totalCount });
    });
    return true;
  }
  
  if (request.action === 'getJobStatus') {
    sendResponse(currentJob);
    return true;
  }
  
  if (request.action === 'stopJob') {
    isProcessing = false;
    if (currentJob.status === 'running') {
      currentJob.status = 'stopped';
      currentJob.message = `Scan stopped at ${currentJob.processedCount} of ${currentJob.totalCount}.`;
      saveState().then(() => sendResponse({ success: true }));
    } else {
      sendResponse({ success: true });
    }
    return true;
  }

  if (request.action === 'resetJob') {
    isProcessing = false;
    currentJob = {
      status: 'idle',
      usernames: [],
      minScore: 0,
      onlyInfluencers: false,
      filteredUsernames: [],
      processedCount: 0,
      totalCount: 0,
      message: ''
    };
    saveState().then(() => sendResponse({ success: true }));
    return true;
  }
}

async function processJob() {
  if (isProcessing) return;
  isProcessing = true;
  
  const usernames = currentJob.usernames;
  const minScore = currentJob.minScore;
  const onlyInfluencers = currentJob.onlyInfluencers;
  
  for (let i = currentJob.processedCount; i < usernames.length; i++) {
    // Wait for internet connection if offline
    while (!navigator.onLine) {
      if (currentJob.status !== 'running') {
        isProcessing = false;
        return;
      }
      currentJob.message = `Network offline. Waiting for connection...`;
      await saveState();
      await new Promise(r => setTimeout(r, 3000));
    }

    if (currentJob.status !== 'running') {
      isProcessing = false;
      return;
    }
    
    const rawUsername = usernames[i];
    const username = (typeof rawUsername === 'string' ? rawUsername : '').replace(/^@/, '').trim();
    if (!username) {
      currentJob.processedCount = i + 1;
      continue;
    }

    currentJob.message = `Processing ${i + 1} of ${currentJob.totalCount}: @${username}...`;
    await saveState();
    
    let attempts = 0;
    let success = false;

    while (!success && attempts < 2 && currentJob.status === 'running') {
      attempts++;
      try {
        const resultObj = await fetchScore(username);
        if (resultObj !== null) {
          const { score, isInfluencer } = resultObj;
          currentJob.message = `Scanned @${username} - Score: ${score}`;
          
          let passesFilter = true;
          if (score < minScore) passesFilter = false;
          if (onlyInfluencers && !isInfluencer) passesFilter = false;
          
          if (passesFilter) {
            const tag = isInfluencer ? ' 🔵 [Influencer]' : '';
            const entry = `@${username} (Score: ${score})${tag}`;
            if (!currentJob.filteredUsernames.some(u => u.startsWith(`@${username} `) || u === `@${username}`)) {
              currentJob.filteredUsernames.push(entry);
            }
          }
        } else {
          currentJob.message = `Scanned @${username} - Score Not Found`;
        }
        success = true;
      } catch (err) {
        console.error(`Error processing @${username}:`, err);
        if (attempts < 2) {
          currentJob.message = `Retrying @${username}...`;
          await saveState();
          await new Promise(r => setTimeout(r, 2000));
        } else {
          currentJob.message = `Skipped @${username} (Timeout/Error)`;
          success = true; // Move to next
        }
      }
    }
    
    if (currentJob.status !== 'running') {
      isProcessing = false;
      return;
    }
    
    currentJob.processedCount = i + 1;
    await saveState();
    
    // 500ms delay between requests for stable rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (currentJob.status === 'running') {
    currentJob.status = 'done';
    currentJob.message = `Done! Found ${currentJob.filteredUsernames.length} profile(s) with a score >= ${minScore}.`;
    await saveState();
  }
  
  isProcessing = false;
}

async function fetchScore(username) {
  try {
    let response = await fetch(`https://twitterscore.io/twitter/${encodeURIComponent(username)}/`, {
      credentials: 'omit',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      
      // Fallback to app.sorsa.io
      response = await fetch(`https://app.sorsa.io/profile/${encodeURIComponent(username)}`, {
        credentials: 'omit',
        headers: {
          'x-from': 'extension',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) return null;
        return null;
      }
    }

    const html = await response.text();
    if (!html) return null;

    let score = null;
    let isInfluencer = false;

    // 1. OpenGraph Meta Tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogTitle) {
      const m = ogTitle[1].match(/Score\s+([\d,.]+)/i);
      if (m) score = parseFloat(m[1].replace(/,/g, ''));
    }

    if (score === null) {
      const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
      if (ogDesc) {
        const m = ogDesc[1].match(/Score\s+(?:of\s+)?([\d,.]+)/i);
        if (m) score = parseFloat(m[1].replace(/,/g, ''));
      }
    }

    // Twitter meta fallback
    if (score === null) {
      const twTitle = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i);
      if (twTitle) {
        const m = twTitle[1].match(/Score\s+([\d,.]+)/i);
        if (m) score = parseFloat(m[1].replace(/,/g, ''));
      }
    }

    // 2. Next.js JSON State
    if (score === null) {
      const jsonMatch = html.match(/"score_value":\s*([\d.]+)/) || 
                        html.match(/\\"score_value\\":\s*([\d.]+)/) ||
                        html.match(/"score":\s*([\d.]+)/);
      if (jsonMatch) score = parseFloat(jsonMatch[1]);
    }

    // 3. HTML Class
    if (score === null) {
      const classMatch = html.match(/class=["'][^"']*profileScoreStats[^"']*["']>([\d,.]+)</i) ||
                         html.match(/class=["'][^"']*styles_scoreValue[^"']*["']>([\d,.]+)</i);
      if (classMatch) score = parseFloat(classMatch[1].replace(/,/g, ''));
    }

    // Influencer Detection
    if (/Category[\s\S]{1,100}Influencer/i.test(html) ||
        /"category":\s*"influencer"/i.test(html) ||
        /\\"category\\":\s*\\"influencer\\"/i.test(html) ||
        /"tags":\s*\[[^\]]*"Influencer"/i.test(html) ||
        /class="[^"]*badge[^"]*"[^>]*>\s*Influencer/i.test(html)) {
      isInfluencer = true;
    }

    if (score !== null) {
      return { score: Number(score.toFixed(2)), isInfluencer };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching score for ${username}:`, error);
    throw error;
  }
}
