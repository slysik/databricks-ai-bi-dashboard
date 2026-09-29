SELECT ROUND(SUM(u.usage_quantity * CAST(p.pricing.default AS DECIMAL(18,6))),2) usd_mtd
FROM system.billing.usage u
JOIN system.billing.list_prices p ON u.sku_name=p.sku_name
 AND u.usage_start_time>=p.price_start_time
 AND (p.price_end_time IS NULL OR u.usage_start_time<p.price_end_time)
WHERE u.usage_metadata.warehouse_id='4bbaafe9538467a0'
 AND u.usage_date>=date_trunc('month',current_date());
