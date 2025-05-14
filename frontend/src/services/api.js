const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const uploadForCBMCalculation = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/cbm-calculator`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process CBM calculation');
    }
    
    return response.json();
};

export const getGoogleSheetData = async (sheetName) => {
    const response = await fetch(`${API_BASE_URL}/sheets/${sheetName}`);
    if (!response.ok) {
        throw new Error('Failed to fetch sheet data');
    }
    return response.json();
};
