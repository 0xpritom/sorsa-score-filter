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
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const usernameListInput = document.getElementById('usernameList');
  const minScoreInput = document.getElementById('minScore');
  const onlyInfluencersCheckbox = document.getElementById('onlyInfluencers');
  const resultListOutput = document.getElementById('resultList');
  const statusEl = document.getElementById('status');
  const fileUpload = document.getElementById('fileUpload');

  let currentFilteredTargets = [];
  let statusInterval = null;
  let inMemoryUsernames = [];

  function updateStatus(msg) {
    statusEl.innerText = msg;
  }

  function extractHandlesFromJSON(obj) {
    const handles = new Set();

    function recurse(item) {
      if (!item) return;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (/^\d+$/.test(trimmed) || /^@\d+$/.test(trimmed)) return;

        const urlMatch = trimmed.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})/i);
        if (urlMatch && urlMatch[1] && !/^\d+$/.test(urlMatch[1])) {
          handles.add(urlMatch[1]);
          return;
        }

        if (trimmed.startsWith('@')) {
          const hMatch = trimmed.match(/^@([a-zA-Z0-9_]{1,15})$/);
          if (hMatch && hMatch[1] && !/^\d+$/.test(hMatch[1])) {
            handles.add(hMatch[1]);
            return;
          }
        }

        if (/^[a-zA-Z0-9_]{1,15}$/.test(trimmed) && !/^\d+$/.test(trimmed)) {
          handles.add(trimmed);
        }
        return;
      }

      if (Array.isArray(item)) {
        item.forEach(recurse);
        return;
      }

      if (typeof item === 'object') {
        const keys = ['screen_name', 'username', 'handle', 'twitter_handle', 'screenName', 'userName', 'user_screen_name'];
        let matched = false;
        for (const k of keys) {
          if (typeof item[k] === 'string' && item[k].trim()) {
            const val = item[k].trim().replace(/^@/, '');
            if (/^[a-zA-Z0-9_]{1,15}$/.test(val) && !/^\d+$/.test(val)) {
              handles.add(val);
              matched = true;
            }
          }
        }

        if (item.legacy && typeof item.legacy.screen_name === 'string') {
          const val = item.legacy.screen_name.trim().replace(/^@/, '');
          if (/^[a-zA-Z0-9_]{1,15}$/.test(val) && !/^\d+$/.test(val)) {
            handles.add(val);
            matched = true;
          }
        }

        if (!matched) {
          Object.values(item).forEach(recurse);
        }
      }
    }

    recurse(obj);
    return Array.from(handles);
  }

  fileUpload.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    updateStatus(`Loading ${files.length} file(s)...`);
    let allExtracted = [];

    const readFileAsync = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target.result;
          let extracted = [];
          
          if (file.name.endsWith('.json')) {
            try {
              const parsed = JSON.parse(content);
              extracted = extractHandlesFromJSON(parsed);
            } catch (err) {
              extracted = extractUsernames(content);
            }
          } else if (file.name.endsWith('.csv')) {
            try {
              const lines = content.split(/\r?\n/);
              if (lines.length > 0) {
                const delimiter = lines[0].includes('\t') ? '\t' : ',';
                const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
                const usernameIndex = headers.findIndex(h => h === 'username' || h === 'screen_name' || h === 'handle');
                
                if (usernameIndex !== -1) {
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
                      let u = cols[usernameIndex].trim().replace(/["']/g, '').replace(/^@/, '');
                      if (u && !/^\d+$/.test(u)) {
                        extracted.push(u);
                      }
                    }
                  }
                } else {
                  extracted = extractUsernames(content);
                }
              }
            } catch (err) {
              extracted = extractUsernames(content);
            }
          } else {
            extracted = extractUsernames(content);
          }
          
          resolve(extracted);
        };
        reader.readAsText(file);
      });
    };

    for (let i = 0; i < files.length; i++) {
      const fileUsernames = await readFileAsync(files[i]);
      fileUsernames.forEach(u => {
        const cleaned = (typeof u === 'string' ? u : '').replace(/^@/, '').trim();
        if (cleaned && !/^\d+$/.test(cleaned)) {
          allExtracted.push(cleaned);
        }
      });
    }

    const uniqueHandles = Array.from(new Set(allExtracted));
    inMemoryUsernames = uniqueHandles;
    
    if (uniqueHandles.length > 0) {
      if (uniqueHandles.length > 1000) {
        usernameListInput.value = uniqueHandles.slice(0, 100).map(u => '@' + u).join('\n') + `\n\n... and ${uniqueHandles.length - 100} more loaded!`;
      } else {
        usernameListInput.value = uniqueHandles.map(u => '@' + u).join('\n');
      }
      updateStatus(`Loaded ${files.length} file(s). Found ${uniqueHandles.length} unique usernames.`);
    } else {
      usernameListInput.value = '';
      updateStatus(`Loaded ${files.length} file(s) but no valid usernames found.`);
    }
  });

  // Sync UI on load
  chrome.runtime.sendMessage({ action: 'getJobStatus' }, (job) => {
    if (job) {
      syncUI(job);
      if (job.status === 'running') {
        startPolling();
      }
    }
  });

  function syncUI(job) {
    if (!job) return;
    if (job.message) updateStatus(job.message);
    
    const targets = job.filteredUsernames || [];
    currentFilteredTargets = targets;

    const newText = targets.join('\n');
    if (resultListOutput.value !== newText) {
      resultListOutput.value = newText;
      resultListOutput.scrollTop = resultListOutput.scrollHeight;
    }

    if (job.status === 'running') {
      filterBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      resetBtn.style.display = 'none';
      stopBtn.disabled = false;
      statusEl.classList.add('scanning-active');

      copyBtn.style.display = targets.length > 0 ? 'inline-flex' : 'none';
      downloadPdfBtn.style.display = targets.length > 0 ? 'inline-flex' : 'none';
      downloadCsvBtn.style.display = targets.length > 0 ? 'inline-flex' : 'none';
    } else if (job.status === 'done' || job.status === 'stopped') {
      filterBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
      resetBtn.style.display = 'flex';
      filterBtn.disabled = false;
      resetBtn.disabled = false;
      statusEl.classList.remove('scanning-active');

      if (targets.length > 0) {
        copyBtn.style.display = 'inline-flex';
        downloadPdfBtn.style.display = 'inline-flex';
        downloadCsvBtn.style.display = 'inline-flex';
      } else {
        copyBtn.style.display = 'none';
        downloadPdfBtn.style.display = 'none';
        downloadCsvBtn.style.display = 'none';
      }
    } else if (job.status === 'idle') {
      filterBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
      resetBtn.style.display = 'none';
      filterBtn.disabled = false;
      copyBtn.style.display = 'none';
      downloadPdfBtn.style.display = 'none';
      downloadCsvBtn.style.display = 'none';
      statusEl.classList.remove('scanning-active');
      updateStatus('System ready. Awaiting input.');
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

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopJob' });
    stopBtn.disabled = true;
    updateStatus('Stopping scan...');
  });

  resetBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'resetJob' }, () => {
      usernameListInput.value = '';
      resultListOutput.value = '';
      currentFilteredTargets = [];
      inMemoryUsernames = [];
      fileUpload.value = '';
      syncUI({ status: 'idle', filteredUsernames: [], processedCount: 0, totalCount: 0 });
    });
  });

  filterBtn.addEventListener('click', () => {
    const rawText = usernameListInput.value.trim();
    const minScore = parseInt(minScoreInput.value, 10);
    
    if (isNaN(minScore) || minScore < 0) {
      updateStatus('Please enter a valid minimum score (e.g. 0).');
      return;
    }

    let usernames = [];
    if (inMemoryUsernames.length > 0 && (rawText.includes('... and') || rawText.length > 1000)) {
      usernames = inMemoryUsernames;
    } else {
      usernames = extractUsernames(rawText);
    }

    if (usernames.length === 0) {
      updateStatus('Please enter some usernames or upload a file first.');
      return;
    }

    // Start job in background
    chrome.runtime.sendMessage({ 
      action: 'startJob', 
      usernames: Array.from(usernames),
      minScore: minScore,
      onlyInfluencers: onlyInfluencersCheckbox.checked
    }, (res) => {
      if (res && res.success) {
        filterBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        resetBtn.style.display = 'none';
        stopBtn.disabled = false;
        resultListOutput.value = '';
        currentFilteredTargets = [];
        copyBtn.style.display = 'none';
        downloadPdfBtn.style.display = 'none';
        downloadCsvBtn.style.display = 'none';
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
    if (!currentFilteredTargets || currentFilteredTargets.length === 0) return;
    if (!window.jspdf) {
      alert("PDF library is not loaded properly.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Sorsa Filter - High Value Targets", 10, 15);
    
    doc.setFontSize(11);
    let y = 28;
    currentFilteredTargets.forEach((target, i) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      const cleanTarget = target.replace('🔵', '').trim();
      doc.text(`${i + 1}. ${cleanTarget}`, 10, y);
      y += 8;
    });
    
    doc.save("Sorsa_Targets.pdf");
  });

  downloadCsvBtn.addEventListener('click', () => {
    if (!currentFilteredTargets || currentFilteredTargets.length === 0) return;
    
    let csvContent = "Username,Score,Is_Influencer\n";
    currentFilteredTargets.forEach(u => {
      const match = u.match(/@([a-zA-Z0-9_]+)\s*\(Score:\s*([\d.]+)\)(.*)/);
      if (match) {
        csvContent += `${match[1]},${match[2]},${match[3].includes('Influencer') ? 'Yes' : 'No'}\n`;
      } else {
        csvContent += `"${u.replace(/"/g, '""')}",,\n`;
      }
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Sorsa_Targets.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  function extractUsernames(text) {
    const lines = text.split(/\r?\n/);
    const usernames = new Set();

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      // Skip pure numeric IDs
      if (/^\d+$/.test(line) || /^@\d+$/.test(line)) return;

      // Extract from URL (e.g., https://x.com/elonmusk or https://twitter.com/elonmusk)
      const urlMatch = line.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})/i);
      if (urlMatch && urlMatch[1] && !/^\d+$/.test(urlMatch[1])) {
        usernames.add(urlMatch[1]);
        return;
      }

      // Extract if it starts with @ (e.g., @elonmusk)
      if (line.startsWith('@')) {
        const handleMatch = line.match(/@([a-zA-Z0-9_]{1,15})/);
        if (handleMatch && handleMatch[1] && !/^\d+$/.test(handleMatch[1])) {
          usernames.add(handleMatch[1]);
          return;
        }
      }

      // Plain handle check
      const plainMatch = line.match(/^([a-zA-Z0-9_]{1,15})$/);
      if (plainMatch && plainMatch[1] && !/^\d+$/.test(plainMatch[1])) {
        usernames.add(plainMatch[1]);
      }
    });

    return Array.from(usernames);
  }
});
