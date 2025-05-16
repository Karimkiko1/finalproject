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
SPREADSHEET_ID = '138EPgPhd0Ddp1-z9xPCexsm5s--t5EHjPpK7NSTT1LI'  # Updated to match frontend config
FALLBACK_SHEET = 'Fallback'

def load_sheet_data(sheet_name):
    try:
        creds = service_account.Credentials.from_service_account_info({
            "type": "service_account",
            "project_id": "gen-lang-client-0437291138",
            "private_key_id": "7cb52af237861c072663d79b19fa424b5b0f06cd",
            "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCnud6aII9KPoXF\nKk2R/Qubp9ZLT9rEwaVgBwko0vCOWRT2M+f60gEIiEfTukq9mUubc9DEbBpR3Y2T\n1Oo21rxCNV+BCLbKwFHYjsJ/15g/rMkAnNdo1Vb1wTBAVmWCRL001FThRkZHqT92\n2tiSy69wfBeUFcH1UeSovkSxogxyZLQiIDOMPE0Hdv0zPVyim3V0YGj0TVfYhRfP\nZZvsSBvo0ePhhu1RJpsj+XK2FtpLrzHYuLoXfUPuAi7jURr3DkAOJ5zc4H1BLHRe\nyHfbx+r5drFiOPlNdwJiSJlq2La/DGc+OarjZYI8ZkjbDVjET4m4NdF9JIiLofId\nNPSFEdeRAgMBAAECggEAAnQ+DtvbTN1/ICqyY0IkRj0QureRGCzlkKY5tGIcIld1\niFt4RI67DiPN7T0K2x0f/C1ku6/Oby4CZGXXaw4xFF6EjOl5BzY3wsCzLtZGnecX\nMwEyE6oZCu2uZfQw3KGV2FNWmv80uwqwz4cVmrw/m/7TN34qZ6T9mmYPFwxFPPOf\nL83MGDh3gGlGt9tHMtfQA7XAsPW37TyV7HZcJUXyBrHLJyk6kjHilX8BmEgqjfyW\n6aix5hxIo2yEWUzjXJZS05lHLMHDdphT5SfSz3i25BP8vldGUT993MgBXAHRfLTc\njnN1kHsIVBZoCSMHJrwrAte6mZjDTzZWnL5Kjx1q0wKBgQDWrXL0118kLST9FuXJ\n7Sgp8sMjwScAOO/x83A6AE2t2OQwhW4VVTWfVO6mLBdezUi/TFzEnxZ3jqUjulGx\neXoGNEt6z4Cp4YNtheY58QUwPBYYXq8lfHLt4I8dl2XA3/dTT8gdfqzkBEyQTVZ1\nE0mSIDfvUrmiyC4peKrSm9DVFwKBgQDIAtE04I0JAkPsUbzSMHEQT/4uV/ZzdDI+\nwUQA+aZOmiliDVF8l9acxYONlxA2OhjJCNHdfqdCWHzLPgZ4ZOopKMaYaybLglDS\nVpHJEIECxV2aEv3CDoYld3s91OWL7hmSqPJISlGCxN2lWMG7TvWJOXIxJ/HS5Sh9\nroX+ZvNxlwKBgQClolvwxv9URTSlxXX0T3POscyYGJ5D0KppLp+nULaebJrbSQe/\nk+f0kC41rg02CwOW/Y8R8YD/K+MEZuxDF2vrv4uBLPqjmCi0ZzxT9j8/kQynLt7J\n+HQgT0N83GQY5XTJJeRLxYIVx69fIxyS5he8k/k0QMqT6wma28xJBQmibwKBgDfK\nmWLflFfD+wBrmHklLBS5y5RP0x5HdlCNBpQjD2HznMGOJ4HStPnMGrMfRVVrBUjm\nnevkDXHzTvQ+m/1vYOYUSrlvgkXYVwUlQstMQEBun3p/+6rq9D51QrpvrYxH4XhI\nijTiDjSlB5K83GWMU+9wR8swckM6yv2r9hKN0zCHAoGANf/umZTZXPjSjlle3skr\nYkqdSXnCxCxqZ3dS7kx5bLMSTe4rv3jg3ZrEncQT0uUe8jpVXvq1G5AUjljk6mHr\ntrbWMnWVd2b0sBFK1lHJdlprQMryrbH3UhfYm7NbwV9Zj9cZgWb+jZol7mPVgAp6\nhX1msA9Ha8Ns8cz2iP5sPNI=\n-----END PRIVATE KEY-----\n",
            "client_email": "streamlit-352@gen-lang-client-0437291138.iam.gserviceaccount.com",
            "client_id": "105593006145302798003"
        }, scopes=SCOPES)
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

@app.route('/api/retailers', methods=['GET'])
def api_retailers():
    try:
        df = load_sheet_data('Tasks')
        if df is None or df.empty:
            return jsonify({'error': 'No data found'}), 404
        # Clean headers (first row is header)
        if df.iloc[0].str.contains('customer_latitude').any():
            df.columns = df.iloc[0]
            df = df[1:]
        # Only keep relevant columns
        cols = [
            'order_id', 'retailer_name', 'customer_area', 'customer_latitude', 'customer_longitude',
            'supplier_name', 'supplier_latitude', 'supplier_longitude', 'created_at', 'delivery_date'
        ]
        df = df[[c for c in cols if c in df.columns]]
        # Validate Egypt coordinates
        def is_valid_egypt_coordinates(lat, lng):
            try:
                lat = float(lat)
                lng = float(lng)
                return 22.0 <= lat <= 31.9 and 24.7 <= lng <= 37.0
            except:
                return False
        df = df[df.apply(lambda row: is_valid_egypt_coordinates(row['customer_latitude'], row['customer_longitude']), axis=1)]
        # Fill NaN with empty string
        df = df.fillna("")
        # Convert to dict
        data = df.to_dict(orient='records')
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
