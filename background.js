chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchScore') {
    fetchScore(request.username)
      .then(score => sendResponse({ success: true, score: score }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

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
    
    // Attempt 1: Extract from Next.js internal JSON state (most accurate, bypasses UI caching)
    const jsonMatch = html.match(/\\"score_value\\":([\d.]+)/);
    if (jsonMatch && jsonMatch[1]) {
      return Math.round(parseFloat(jsonMatch[1]));
    }
    
    // Attempt 2: Extract from Next.js HTML response.
    const regex = /class="[^"]*profileScoreStats[^"]*">([\d,]+)</;
    const match = html.match(regex);
    if (match && match[1]) {
      const scoreString = match[1].replace(/,/g, '');
      return parseInt(scoreString, 10);
    }
    
    // Fallback 3: Check if it's inside a different structure
    const regexFallback = /class="[^"]*styles_scoreValue[^"]*">([\d,]+)</;
    const matchFallback = html.match(regexFallback);
    if (matchFallback && matchFallback[1]) {
      const scoreString = matchFallback[1].replace(/,/g, '');
      return parseInt(scoreString, 10);
    }

    return null; // Score not found on the page
  } catch (error) {
    console.error(`Error fetching score for ${username}:`, error);
    throw error;
  }
}
