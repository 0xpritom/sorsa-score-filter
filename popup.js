document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');

  // Load theme preference
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }

  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    if (document.body.classList.contains('light-theme')) {
      localStorage.setItem('theme', 'light');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      localStorage.setItem('theme', 'dark');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  });

  const filterBtn = document.getElementById('filterBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const usernameListInput = document.getElementById('usernameList');
  const minScoreInput = document.getElementById('minScore');
  const resultListOutput = document.getElementById('resultList');
  const statusEl = document.getElementById('status');
  const fileUpload = document.getElementById('fileUpload');

  let currentFilteredTargets = [];

  function updateStatus(msg) {
    statusEl.innerText = msg;
  }

  fileUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      
      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          const extractStrings = (obj) => {
            let strings = [];
            if (typeof obj === 'string') {
              strings.push(obj);
            } else if (Array.isArray(obj)) {
              obj.forEach(item => strings = strings.concat(extractStrings(item)));
            } else if (typeof obj === 'object' && obj !== null) {
              Object.values(obj).forEach(val => strings = strings.concat(extractStrings(val)));
            }
            return strings;
          };
          usernameListInput.value = extractStrings(parsed).join('\n');
        } catch (err) {
          usernameListInput.value = content; // Fallback to raw text
        }
      } else if (file.name.endsWith('.csv')) {
        try {
          const lines = content.split(/\r?\n/);
          if (lines.length > 0) {
            const delimiter = lines[0].includes('\t') ? '\t' : ',';
            const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
            const usernameIndex = headers.findIndex(h => h === 'username' || h === 'screen_name' || h === 'handle');
            
            if (usernameIndex !== -1) {
              const extracted = [];
              const parseCSVLine = (line) => {
                const result = [];
                let curr = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                  if (line[i] === '"') inQuotes = !inQuotes;
                  else if (line[i] === delimiter && !inQuotes) {
                    result.push(curr);
                    curr = '';
                  } else {
                    curr += line[i];
                  }
                }
                result.push(curr);
                return result;
              };

              for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const cols = parseCSVLine(lines[i]);
                if (cols.length > usernameIndex) {
                  let username = cols[usernameIndex].trim().replace(/["']/g, '').replace(/^@/, '');
                  if (username) extracted.push(username);
                }
              }

              if (extracted.length > 0) {
                usernameListInput.value = extracted.join('\n');
              } else {
                usernameListInput.value = content; // Fallback if empty column
              }
            } else {
              usernameListInput.value = content; // Fallback if no header found
            }
          }
        } catch (err) {
          usernameListInput.value = content;
        }
      } else {
        usernameListInput.value = content;
      }
      
      updateStatus(`File "${file.name}" loaded into Option 1.`);
    };
    reader.readAsText(file);
  });

  let statusInterval = null;

  // Sync UI on load
  chrome.runtime.sendMessage({ action: 'getJobStatus' }, (job) => {
    if (job && (job.status === 'running' || job.status === 'done')) {
      syncUI(job);
      if (job.status === 'running') {
        startPolling();
      }
    }
  });

  function syncUI(job) {
    if (job.message) updateStatus(job.message);
    
    // Only update textarea if it's different to prevent resetting selection
    const newText = job.filteredUsernames.join('\n');
    if (resultListOutput.value !== newText) {
      resultListOutput.value = newText;
    }
    
    currentFilteredTargets = job.filteredUsernames;
    
    if (job.status === 'running') {
      filterBtn.disabled = true;
      copyBtn.style.display = 'none';
      downloadPdfBtn.style.display = 'none';
      statusEl.classList.add('scanning-active');
    } else if (job.status === 'done') {
      statusEl.classList.remove('scanning-active');
      filterBtn.disabled = false;
      if (job.filteredUsernames.length > 0) {
        copyBtn.style.display = 'flex';
        downloadPdfBtn.style.display = 'flex';
      } else {
        copyBtn.style.display = 'none';
        downloadPdfBtn.style.display = 'none';
      }
    }
  }

  function startPolling() {
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'getJobStatus' }, (job) => {
        if (!job) return;
        syncUI(job);
        if (job.status !== 'running') {
          clearInterval(statusInterval);
        }
      });
    }, 500);
  }

  filterBtn.addEventListener('click', () => {
    const rawText = usernameListInput.value.trim();
    const minScore = parseInt(minScoreInput.value, 10);
    
    if (isNaN(minScore)) {
      updateStatus('Please enter a valid minimum score.');
      return;
    }

    const usernames = extractUsernames(rawText);
    if (usernames.length === 0) {
      updateStatus('Please enter some usernames or URLs first.');
      return;
    }

    // Start job in background
    chrome.runtime.sendMessage({ 
      action: 'startJob', 
      usernames: Array.from(usernames),
      minScore: minScore 
    }, (res) => {
      if (res && res.success) {
        filterBtn.disabled = true;
        resultListOutput.value = '';
        copyBtn.style.display = 'none';
        downloadPdfBtn.style.display = 'none';
        statusEl.classList.add('scanning-active');
        updateStatus('Starting scan...');
        startPolling();
      } else if (res && res.error) {
        updateStatus('Error: ' + res.error);
      }
    });
  });

  copyBtn.addEventListener('click', () => {
    resultListOutput.select();
    document.execCommand('copy');
    const originalText = copyBtn.innerText;
    copyBtn.innerText = 'Copied!';
    setTimeout(() => {
      copyBtn.innerText = originalText;
    }, 2000);
  });

  downloadPdfBtn.addEventListener('click', () => {
    if (!window.jspdf) {
      alert("PDF library is not loaded properly.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Sorsa Filter - High Value Targets", 10, 15);
    
    doc.setFontSize(12);
    let y = 30;
    currentFilteredTargets.forEach(target => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(target, 10, y);
      y += 8;
    });
    
    doc.save("Sorsa_Targets.pdf");
  });

  function extractUsernames(text) {
    const lines = text.split('\n');
    const usernames = new Set();

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      // Extract from URL (e.g., https://x.com/elonmusk or https://twitter.com/elonmusk)
      const urlMatch = line.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})/i);
      if (urlMatch && urlMatch[1]) {
        usernames.add(urlMatch[1]);
        return;
      }

      // Extract if it starts with @ (e.g., @elonmusk)
      if (line.startsWith('@')) {
        const handleMatch = line.match(/@([a-zA-Z0-9_]{1,15})/);
        if (handleMatch && handleMatch[1]) {
          usernames.add(handleMatch[1]);
          return;
        }
      }

      // Otherwise assume the whole line is a username, stripping any weird chars just in case
      const plainMatch = line.match(/^([a-zA-Z0-9_]{1,15})$/);
      if (plainMatch && plainMatch[1]) {
        usernames.add(plainMatch[1]);
      }
    });

    return Array.from(usernames);
  }

  function updateStatus(message) {
    statusEl.innerText = message;
  }
});
