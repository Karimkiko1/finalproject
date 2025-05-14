import { loadSheetData } from '../utils/googleSheets';

export const fetchSheetData = async (sheetName) => {
  try {
    const data = await loadSheetData(sheetName);
    return data;
  } catch (error) {
    console.error(`Error fetching sheet ${sheetName}:`, error);
    throw new Error(`Failed to load ${sheetName} data: ${error.message}`);
  }
};
