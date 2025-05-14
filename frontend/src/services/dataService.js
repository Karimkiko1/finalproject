import { initGoogleAPI, loadSheetData } from './googleSheets';

const SPREADSHEET_ID = '138EPgPhd0Ddp1-z9xPCexsm5s--t5EHjPpK7NSTT1LI';

export const loadFallbackData = async () => {
  try {
    await initGoogleAPI();
    const data = await loadSheetData(SPREADSHEET_ID, 'Fallback');
    return data;
  } catch (error) {
    console.error('Error loading fallback data:', error);
    throw error;
  }
};

export const loadTasksData = async () => {
  try {
    await initGoogleAPI();
    const data = await loadSheetData(SPREADSHEET_ID, 'Tasks');
    return data;
  } catch (error) {
    console.error('Error loading tasks data:', error);
    throw error;
  }
};

export const loadRunsheetData = async () => {
  try {
    await initGoogleAPI();
    const data = await loadSheetData(SPREADSHEET_ID, 'Runsheet');
    return data;
  } catch (error) {
    console.error('Error loading runsheet data:', error);
    throw error;
  }
};
