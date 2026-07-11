const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapeData() {
  console.log("Launching headless browser...");
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // Storage for scraped data
  const data = {
    configs: [],
    dnyaneshwar: null,
    tukaram: null,
    lastUpdated: new Date().toISOString()
  };

  let trackingIsClosed = false;

  page.on('response', async (response) => {
    const type = response.request().resourceType();
    if (type === 'xhr' || type === 'fetch') {
      const url = response.url();
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        
        // Configs API usually returns an array of objects
        if (url.includes('TrackPalkhiApi/appConfigs') || Array.isArray(json) && json.length > 0 && json[0].keyName) {
          console.log("Intercepted configs API.");
          data.configs = json;
          
          // Check if tracking is explicitly closed or liveUpdate contains a closed message
          const liveUpdateItem = json.find(i => i.keyName === 'liveUpdate');
          const isTrackEnabled = json.find(i => i.keyName === 'isTrackEnabled');
          
          if ((liveUpdateItem && liveUpdateItem.keyValue.toLowerCase().includes('tracking is closed')) ||
              (isTrackEnabled && isTrackEnabled.keyValue === 'FALSE')) {
            console.log("Tracker API explicitly says tracking is closed/disabled.");
            trackingIsClosed = true;
          }
        } 
        // We don't know the exact GPS URL yet, but it will be an XHR/fetch returning JSON.
        // We will store all other JSONs under a generic key for now just in case.
        else if (Array.isArray(json) || typeof json === 'object') {
          console.log("Intercepted potential GPS API:", url);
          if (!data.gps_dump) data.gps_dump = {};
          data.gps_dump[url] = json;
        }
      } catch (e) {
        // Not JSON or failed to read text
      }
    }
  });

  console.log("Navigating to tracker...");
  try {
    await page.goto('https://diversion.punepolice.gov.in/palkhi/track', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait a little bit for API calls to settle
    console.log("Waiting up to 10 seconds for initial API calls...");
    let waited = 0;
    while (waited < 10) {
      await new Promise(r => setTimeout(r, 1000));
      waited++;
      if (trackingIsClosed) {
        console.log("Tracking is closed. Stopping early.");
        break; // Stop waiting if we confirmed it's closed
      }
    }
  } catch(e) {
    console.error("Error loading page:", e);
  }

  console.log("Done scraping. Saving data...");
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  fs.writeFileSync(path.join(dataDir, 'live_status.json'), JSON.stringify(data, null, 2));
  console.log("Data saved to data/live_status.json");

  await browser.close();
}

scrapeData();
