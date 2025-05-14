import { SERVICE_ACCOUNT_CREDENTIALS, SPREADSHEET_ID } from './credentials';

export const initGoogleAPI = () => {
  return new Promise((resolve, reject) => {
    // Prevent loading the script multiple times
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
            apiKey: 'AIzaSyDimPuTIa_Iv1Ow1jFFyKf_0M-BihtLCzI',
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
  console.log(`Loading sheet: ${sheetName}`);
  try {
    if (!window.gapi?.client?.sheets) {
      await initGoogleAPI();
    }

    const response = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });

    if (!response.result?.values) {
      throw new Error(`No data found in ${sheetName} sheet`);
    }

    const rows = response.result.values;
    const headers = rows[0];

    // Handle empty and duplicate headers like Python code
    const cleanHeaders = [];
    const seenHeaders = new Set();
    headers.forEach((header, idx) => {
      if (!header) {
        header = `column_${idx}`;
      }
      
      let uniqueHeader = header;
      let counter = 1;
      while (seenHeaders.has(uniqueHeader)) {
        uniqueHeader = `${header}_${counter}`;
        counter++;
      }
      
      seenHeaders.add(uniqueHeader);
      cleanHeaders.push(uniqueHeader);
    });

    // Process data rows like Python code
    return rows.slice(1).map(row => {
      const obj = {};
      cleanHeaders.forEach((header, i) => {
        const value = row[i];
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

  } catch (error) {
    console.error('Error loading sheet:', error);
    let msg = 'Unknown error';
    if (error && typeof error === 'object') {
      if (error.message) {
        msg = error.message;
      } else if (error.result && error.result.error && error.result.error.message) {
        msg = error.result.error.message;
      } else {
        try {
          msg = JSON.stringify(error);
        } catch {
          msg = 'Unknown error';
        }
      }
    } else if (typeof error === 'string') {
      msg = error;
    }
    throw new Error(`Failed to load ${sheetName}: ${msg}`);
  }
};

export const loadFallbackData = async () => {
  try {
    if (!window.gapi) {
      await initGoogleAPI();
    }

    const response = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: '138EPgPhd0Ddp1-z9xPCexsm5s--t5EHjPpK7NSTT1LI',
      range: 'Fallback'
    });

    if (!response.result.values) {
      throw new Error('No data found in Fallback sheet');
    }

    const headers = response.result.values[0];
    const data = response.result.values.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        if (row[i] && !isNaN(row[i].replace(',', '.'))) {
          obj[header] = parseFloat(row[i].replace(',', '.'));
        } else {
          obj[header] = row[i] || '';
        }
      });
      return obj;
    });

    return data;
  } catch (error) {
    console.error('Error loading fallback data:', error);
    let msg = 'Unknown error';
    if (error && typeof error === 'object') {
      if (error.message) {
        msg = error.message;
      } else if (error.result && error.result.error && error.result.error.message) {
        msg = error.result.error.message;
      } else {
        try {
          msg = JSON.stringify(error);
        } catch {
          msg = 'Unknown error';
        }
      }
    } else if (typeof error === 'string') {
      msg = error;
    }
    throw new Error(msg);
  }
};
