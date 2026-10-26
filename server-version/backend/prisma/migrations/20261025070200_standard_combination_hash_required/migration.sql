-- CHECK treats NULL as accepted; require the exact hash explicitly.
ALTER TABLE material_grants ADD CONSTRAINT standard_combination_hash_required
 CHECK(resource_type<>'STANDARD_COMBINATION' OR standard_combination_hash IS NOT NULL);
