# 🟡 Sorsa Score Filter

A premium, high-performance Chrome Extension built to instantly filter X (Twitter) profiles based on their [Sorsa](https://app.sorsa.io/) scores. 

Whether you're processing bulk CSV exports or manually checking high-value targets, this tool intelligently scrapes and filters profiles in real-time, completely bypassing client-side rendering delays to fetch the true hidden scores.

---

## ✨ Features

- **Bulk Data Parsing:** Upload `.txt`, `.csv`, or `.json` files. The built-in smart parser automatically detects and extracts usernames, ignoring junk data.
- **Deep JSON Scraping:** Bypasses Next.js visual placeholder bugs by extracting the true Sorsa score directly from the encrypted internal JSON payload.
- **Live Scanning UI:** Features a sleek neon-glow pulse animation while actively scanning targets.
- **Premium Design:** Beautiful glassmorphism interface, complete with Dark/Light mode toggles and a custom-designed Black & Neon Yellow brand identity.
- **1-Click Copy:** Instantly copy your filtered list of high-value targets.

## 🚀 Installation

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/YOUR-USERNAME/sorsa-score-filter.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Turn on **Developer mode** (toggle switch in the top right corner).
4. Click the **Load unpacked** button.
5. Select the `twitter-sorsa-filter` directory.
6. The extension is now installed! Pin it to your toolbar for easy access.

## 💡 How to Use

1. Click the extension icon to open the popup.
2. Set your **Min. Target Score** (e.g., `50`).
3. Provide targets via **Option 1** (Upload a file) or **Option 2** (Paste usernames/URLs directly).
4. Click **Filter Targets**.
5. Watch the live scan. Once finished, click **Copy Results** to grab your high-value targets!

## 🛠️ Built With
- HTML5, CSS3 (Glassmorphism UI, CSS Variables)
- Vanilla JavaScript (ES6+, DOM Manipulation, FileReader API)
- Chrome Extension Manifest V3 (Service Workers, Message Passing)

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
