export const getCBMWeightAppScriptStyle = (row, fallbackData) => {
  try {
    const measureValue = parseFloat(row.measurement_value || 0);
    const unitCountValue = parseFloat(row.unit_count || 0);

    // Exact match: brand, category, measure, unit_count
    const exact = fallbackData.find(f => 
      f.BRAND_NAME === row.brand_name &&
      f.CATEGORY === row.category &&
      parseFloat(f.measure) === measureValue &&
      parseFloat(f['unit count']) === unitCountValue
    );
    
    if (exact) {
      return {
        confidence: 100,
        cbm: parseFloat(exact.CBM.replace(',', '.')),
        weight: parseFloat(exact.Weight.replace(',', '.'))
      };
    }

    // Category match (ignore brand)
    const catMatch = fallbackData.find(f => 
      f.CATEGORY_mid === row.category &&
      parseFloat(f.measure_mid) === measureValue &&
      parseFloat(f.unit_count_mid) === unitCountValue
    );

    if (catMatch) {
      return {
        confidence: 70,
        cbm: parseFloat(catMatch.CBM_mid.replace(',', '.')),
        weight: parseFloat(catMatch.Weight_mid.replace(',', '.'))
      };
    }

    // Category average
    const catAvg = fallbackData.find(f => f.CATEGORY_AVG === row.category);
    if (catAvg) {
      return {
        confidence: 30,
        cbm: parseFloat(catAvg.CBM_AVG.replace(',', '.')),
        weight: parseFloat(catAvg.Weight_AVG.replace(',', '.'))
      };
    }

    return { confidence: 0, cbm: 0, weight: 0 };
  } catch (error) {
    console.error('Error processing row:', error);
    return { confidence: 0, cbm: 0, weight: 0 };
  }
};
