let currentJob = {
  status: 'idle', // idle | running | done
  usernames: [],
  minScore: 0,
  filteredUsernames: [],
  processedCount: 0,
  totalCount: 0,
  message: ''
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startJob') {
    if (currentJob.status === 'running') {
      sendResponse({ success: false, error: 'Job already running' });
      return;
    }
    
    currentJob = {
      status: 'running',
      usernames: request.usernames,
      minScore: request.minScore,
      filteredUsernames: [],
      processedCount: 0,
      totalCount: request.usernames.length,
      message: 'Starting scan...'
    };
    
    // Start processing asynchronously
    processJob();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getJobStatus') {
    sendResponse(currentJob);
    return true;
  }
  
  if (request.action === 'stopJob') {
    if (currentJob.status === 'running') {
      currentJob.status = 'stopped';
    }
    sendResponse({ success: true });
    return true;
  }
});

async function processJob() {
  const usernames = currentJob.usernames;
  const minScore = currentJob.minScore;
  
  for (const username of usernames) {
    if (currentJob.status !== 'running') break; // Allow manual abort if implemented later
    
    currentJob.message = `Processing ${currentJob.processedCount + 1} of ${currentJob.totalCount}: @${username}...`;
    
    try {
      const resultObj = await fetchScore(username);
      if (resultObj !== null) {
        const { score, isInfluencer } = resultObj;
        console.log(`@${username} - Score: ${score}, Influencer: ${isInfluencer}`);
        currentJob.message = `Scanned @${username} - Score: ${score}`;
        if (score >= minScore) {
          const tag = isInfluencer ? ' 🔵 [Influencer]' : '';
          currentJob.filteredUsernames.push(`@${username} (Score: ${score})${tag}`);
        }
      } else {
        console.log(`@${username} - Score not found`);
        currentJob.message = `Scanned @${username} - Not Found`;
      }
    } catch (err) {
      console.error(`Error processing @${username}:`, err);
      currentJob.message = `System error scanning @${username}`;
    }
    
    currentJob.processedCount++;
    await new Promise(r => setTimeout(r, 500)); // Rate limit prevention
  }
  
  if (currentJob.status === 'stopped') {
    currentJob.message = `Scan stopped early! Found ${currentJob.filteredUsernames.length} profile(s).`;
  } else {
    currentJob.status = 'done';
    currentJob.message = `Done! Found ${currentJob.filteredUsernames.length} profile(s) with a score >= ${minScore}.`;
  }
}

async function fetchScore(username) {
  try {
    const response = await fetch(`https://app.sorsa.io/profile/${username}`, {
      credentials: 'omit', // Force unauthenticated request to ensure we get SSR HTML with the score
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      if (response.status === 404) return null; // User not found
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    let score = null;
    
    const isInfluencer = /\\"category\\":\s*\\"influencer\\"/i.test(html) || /\\"tags\\":\s*\[[^\]]*\\"Influencer\\"/i.test(html);
    
    // Attempt 1: Extract from Next.js internal JSON state (most accurate, bypasses UI caching)
    const jsonMatch = html.match(/\\"score_value\\":([\d.]+)/);
    if (jsonMatch && jsonMatch[1]) {
      score = Math.round(parseFloat(jsonMatch[1]));
    } else {
      // Attempt 2: Extract from Next.js HTML response.
      const regex = /class="[^"]*profileScoreStats[^"]*">([\d,]+)</;
      const match = html.match(regex);
      if (match && match[1]) {
        score = parseInt(match[1].replace(/,/g, ''), 10);
      } else {
        // Fallback 3: Check if it's inside a different structure
        const regexFallback = /class="[^"]*styles_scoreValue[^"]*">([\d,]+)</;
        const matchFallback = html.match(regexFallback);
        if (matchFallback && matchFallback[1]) {
          score = parseInt(matchFallback[1].replace(/,/g, ''), 10);
        }
      }
    }

    if (score !== null) {
      return { score, isInfluencer };
    }
    return null; // Score not found on the page
  } catch (error) {
    console.error(`Error fetching score for ${username}:`, error);
    throw error;
  }
}
