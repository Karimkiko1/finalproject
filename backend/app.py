from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime
import io

app = Flask(__name__)

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
SPREADSHEET_ID = 'your-spreadsheet-id'
FALLBACK_SHEET = 'Fallback'

def load_sheet_data(sheet_name):
    try:
        creds = service_account.Credentials.from_service_account_file(
            'credentials.json', scopes=SCOPES)
        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()
        result = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID, range=sheet_name).execute()
        return pd.DataFrame(result.get('values', []))
    except Exception as e:
        print(f"Error loading sheet: {e}")
        return None

@app.route('/api/cbm-calculator', methods=['POST'])
def cbm_calculator():
    try:
        file = request.files['file']
        df = pd.read_excel(file) if file.filename.endswith(('.xlsx', '.xls')) else pd.read_csv(file)
        
        fallback_df = load_sheet_data(FALLBACK_SHEET)
        if fallback_df is None:
            return jsonify({'error': 'Failed to load fallback data'}), 500
        
        results = apply_cbm_weight_calculation(df, fallback_df)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_cbm_weight_appscript_style(row, fallback_df):
    try:
        measure_value = pd.to_numeric(row.get('measurement_value', 0), errors='coerce')
        unit_count_value = pd.to_numeric(row.get('unit_count', 0), errors='coerce')
        
        # Exact match
        exact = fallback_df[
            (fallback_df['BRAND_NAME'] == row['brand_name']) &
            (fallback_df['CATEGORY'] == row['category']) &
            (pd.to_numeric(fallback_df['measure'], errors='coerce') == measure_value) &
            (pd.to_numeric(fallback_df['unit count'], errors='coerce') == unit_count_value)
        ]
        if not exact.empty:
            return 100, float(exact['CBM'].iloc[0]), float(exact['Weight'].iloc[0])
        
        # Category match
        cat_match = fallback_df[
            (fallback_df['CATEGORY'] == row['category']) &
            (pd.to_numeric(fallback_df['measure'], errors='coerce') == measure_value) &
            (pd.to_numeric(fallback_df['unit count'], errors='coerce') == unit_count_value)
        ]
        if not cat_match.empty:
            return 70, float(cat_match['CBM'].iloc[0]), float(cat_match['Weight'].iloc[0])
        
        # Category average
        cat_avg = fallback_df[fallback_df['CATEGORY'] == row['category']]
        if not cat_avg.empty:
            return 30, float(cat_avg['CBM'].mean()), float(cat_avg['Weight'].mean())
        
        return 0, 0, 0
    except Exception as e:
        print(f"Error processing row: {e}")
        return 0, 0, 0

def apply_cbm_weight_calculation(df, fallback_df):
    results = []
    summary = {'total_cbm': 0, 'total_weight': 0, 'confidence_levels': {}}
    
    for _, row in df.iterrows():
        confidence, cbm, weight = get_cbm_weight_appscript_style(row, fallback_df)
        quantity = float(row.get('product_amount', 1))
        
        result = {
            'order_id': row.get('order_id', ''),
            'product_id': row.get('product_id', ''),
            'confidence': confidence,
            'cbm': cbm,
            'weight': weight,
            'total_cbm': cbm * quantity,
            'total_weight': weight * quantity
        }
        results.append(result)
        
        summary['total_cbm'] += result['total_cbm']
        summary['total_weight'] += result['total_weight']
        summary['confidence_levels'][confidence] = summary['confidence_levels'].get(confidence, 0) + 1
    
    return {
        'results': results,
        'summary': summary
    }

if __name__ == '__main__':
    app.run(debug=True)
