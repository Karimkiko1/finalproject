// Google Sheets API loader for browser (no googleapis import!)
// Uses window.gapi (Google API JS client) for browser access

const SPREADSHEET_ID = '138EPgPhd0Ddp1-z9xPCexsm5s--t5EHjPpK7NSTT1LI';

export const initGoogleAPI = () => {
  return new Promise((resolve, reject) => {
    if (window.gapi?.client?.sheets) {
      resolve(window.gapi);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
          });
          await window.gapi.client.load('sheets', 'v4');
          resolve(window.gapi);
        } catch (error) {
          reject(error);
        }
      });
    };
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.body.appendChild(script);
  });
};

export const loadSheetData = async (sheetName) => {
  await initGoogleAPI();
  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:Z3`, // Only fetch first 3 rows and up to column Z
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  if (!response.result?.values?.length) {
    throw new Error('No data found in sheet');
  }
  const headers = response.result.values[0];
  return response.result.values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      const value = row[idx];
      if (value === undefined || value === '') {
        obj[header] = '';
      } else if (typeof value === 'string' && !isNaN(value.replace(',', '.'))) {
        obj[header] = parseFloat(value.replace(',', '.'));
      } else {
        obj[header] = value;
      }
    });
    return obj;
  });
};

/**
 * Update a range of values in a Google Sheet.
 * @param {string} sheetName - The sheet/tab name (e.g. 'Runsheet')
 * @param {string} range - The A1 notation range (e.g. 'C2:D100')
 * @param {Array<Array<any>>} values - 2D array of values to write
 * @returns {Promise<any>} - API response
 */
export const updateSheetValues = async (sheetName, range, values) => {
  await initGoogleAPI();
  const fullRange = `${sheetName}!${range}`;
  const response = await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: fullRange,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
  return response;
};
