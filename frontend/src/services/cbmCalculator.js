export const calculateProductCBM = (data, fallbackData) => {
  const results = data.map(row => {
    const { confidence, cbm, weight } = getCBMAndWeight(row, fallbackData);
    return {
      ...row,
      cbm_confidence: confidence,
      calculated_cbm: cbm * (parseFloat(row.product_amount) || 1),
      calculated_weight: weight * (parseFloat(row.product_amount) || 1)
    };
  });

  return {
    results,
    summary: generateSummary(results),
    unmatched: results.filter(r => r.cbm_confidence === 0)
  };
};

const getCBMAndWeight = (row, fallbackData) => {
  // Exact match
  const exact = fallbackData.find(f => 
    f.brand_name === row.brand_name &&
    f.category === row.category &&
    f.measurement_value === row.measurement_value &&
    f.unit_count === row.unit_count
  );
  if (exact) {
    return { confidence: 100, cbm: exact.CBM, weight: exact.Weight };
  }

  // Category match
  const catMatch = fallbackData.find(f =>
    f.category === row.category &&
    f.measurement_value === row.measurement_value &&
    f.unit_count === row.unit_count
  );
  if (catMatch) {
    return { confidence: 70, cbm: catMatch.CBM, weight: catMatch.Weight };
  }

  // Category average
  const catAvg = fallbackData.find(f => f.category === row.category);
  if (catAvg) {
    return { confidence: 30, cbm: catAvg.CBM_AVG, weight: catAvg.Weight_AVG };
  }

  return { confidence: 0, cbm: 0, weight: 0 };
};

const generateSummary = (results) => {
  return results.reduce((acc, row) => {
    const orderId = row.order_id || 'Unknown';
    if (!acc[orderId]) {
      acc[orderId] = {
        order_id: orderId,
        total_cbm: 0,
        total_weight: 0,
        total_products: 0,
        total_quantity: 0
      };
    }
    acc[orderId].total_cbm += row.calculated_cbm;
    acc[orderId].total_weight += row.calculated_weight;
    acc[orderId].total_products += 1;
    acc[orderId].total_quantity += parseFloat(row.product_amount) || 1;
    return acc;
  }, {});
};
