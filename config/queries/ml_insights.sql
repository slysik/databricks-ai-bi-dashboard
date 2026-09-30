SELECT trained_at, ttest_statistic, ttest_pvalue, diff_in_diff_estimate_usd, diff_in_diff_pvalue,
  treated_regions, heatwave_start, heatwave_end, model_type, model_train_auc, model_test_auc,
  model_test_accuracy, model_name, model_version, mlflow_experiment_id, mlflow_run_id, pipeline_id
FROM finserv.energy_pulse.gold_ml_insights
ORDER BY trained_at DESC
LIMIT 1;
