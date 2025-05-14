export const calculateCBM = (length, width, height, quantity = 1) => {
  const l = length > 100 ? length / 100 : length;
  const w = width > 100 ? width / 100 : width;
  const h = height > 100 ? height / 100 : height;
  return l * w * h * quantity;
};

export const calculateProductCBM = (runsheetData, fallbackData) => {
  const results = runsheetData.map(row => {
    const { confidence, cbm, weight } = getCBMAndWeight(row, fallbackData);
    const quantity = parseFloat(row.product_amount) || 1;

    return {
      ...row,
      cbm_confidence: confidence,
      calculated_cbm: cbm * quantity,
      calculated_weight: weight * quantity
    };
  });

  // Calculate summary
  const summary = {
    totalCBM: results.reduce((sum, row) => sum + row.calculated_cbm, 0),
    totalWeight: results.reduce((sum, row) => sum + row.calculated_weight, 0),
    confidenceLevels: results.reduce((acc, row) => {
      acc[row.cbm_confidence] = (acc[row.cbm_confidence] || 0) + 1;
      return acc;
    }, {})
  };

  return {
    results,
    summary,
    unmatched: results.filter(r => r.cbm_confidence === 0)
  };
};

const getCBMAndWeight = (row, fallbackData) => {
  try {
    // Convert measure and unit count to numeric
    const measureValue = parseFloat(row.measurement_value || 0);
    const unitCount = parseFloat(row.unit_count || 0);

    // 1. Exact match: brand, category, measure, unit_count
    const exact = fallbackData.find(f => 
      f.BRAND_NAME === row.brand_name &&
      f.CATEGORY === row.category &&
      parseFloat(f.measure) === measureValue &&
      parseFloat(f['unit count']) === unitCount
    );

    if (exact) {
      return {
        confidence: 100,
        cbm: parseFloat(String(exact.CBM).replace(',', '.')),
        weight: parseFloat(String(exact.Weight).replace(',', '.'))
      };
    }

    // 2. Category match (ignore brand)
    const catMatch = fallbackData.find(f =>
      f.CATEGORY_mid === row.category &&
      parseFloat(f.measure_mid) === measureValue &&
      parseFloat(f.unit_count_mid) === unitCount
    );

    if (catMatch) {
      return {
        confidence: 70,
        cbm: parseFloat(String(catMatch.CBM_mid).replace(',', '.')),
        weight: parseFloat(String(catMatch.Weight_mid).replace(',', '.'))
      };
    }

    // 3. Category average
    const catAvg = fallbackData.find(f => f.CATEGORY_AVG === row.category);
    if (catAvg) {
      return {
        confidence: 30,
        cbm: parseFloat(String(catAvg.CBM_AVG).replace(',', '.')),
        weight: parseFloat(String(catAvg.Weight_AVG).replace(',', '.'))
      };
    }

    return { confidence: 0, cbm: 0, weight: 0 };
  } catch (error) {
    console.error('Error calculating CBM:', error);
    return { confidence: 0, cbm: 0, weight: 0 };
  }
};
