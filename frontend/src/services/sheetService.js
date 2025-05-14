import { gapi } from 'gapi-script';

const SPREADSHEET_ID = '138EPgPhd0Ddp1-z9xPCexsm5s--t5EHjPpK7NSTT1LI';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Initialize the Google Sheets API
export const initGoogleSheetsApi = async () => {
  try {
    await gapi.client.init({
      apiKey: 'AIzaSyDimPuTIa_Iv1Ow1jFFyKf_0M-BihtLCzI',
      clientId: '709785258281-76k4d513h4o5k5nvmt9kach0ps35segu.apps.googleusercontent.com',
      discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
      scope: SCOPES.join(' ')
    });
    return true;
  } catch (error) {
    console.error('Error initializing Google Sheets API:', error);
    throw error;
  }
};

// Load data from a specific sheet
export const loadSheetData = async (sheetName) => {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName
    });

    const rows = response.result.values;
    if (!rows || rows.length === 0) {
      throw new Error('No data found in sheet');
    }

    // Convert to object array like DB.py does
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        // Handle numeric conversions like DB.py
        const value = row[idx] || '';
        if (!isNaN(value) && value !== '') {
          obj[header] = parseFloat(value.replace(',', '.'));
        } else {
          obj[header] = value;
        }
      });
      return obj;
    });

    return data;
  } catch (error) {
    console.error('Error loading sheet data:', error);
    throw error;
  }
};

// Load specific sheets needed for CBM calculation
export const loadCBMData = async () => {
  try {
    const [fallbackData, tasksData, runsheetData] = await Promise.all([
      loadSheetData('Fallback'),
      loadSheetData('Tasks'),
      loadSheetData('Runsheet')
    ]);

    return {
      fallbackData,
      tasksData,
      runsheetData
    };
  } catch (error) {
    console.error('Error loading CBM data:', error);
    throw error;
  }
};
