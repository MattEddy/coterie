-- =============================================================================
-- Missing indexes and triggers identified during code review (2026-04-06)
-- =============================================================================

-- Index for maps.source_coterie_id — used in acceptInvitation and get_dissonances
CREATE INDEX IF NOT EXISTS idx_maps_source_coterie ON maps(source_coterie_id);

-- Index for maps_objects.object_ref_id — queried in dissonance detection and map operations
CREATE INDEX IF NOT EXISTS idx_maps_objects_object_ref ON maps_objects(object_ref_id);

-- Index for reverse lookup on objects_overrides (the UNIQUE covers user_id, object_id)
CREATE INDEX IF NOT EXISTS idx_objects_overrides_object_user ON objects_overrides(object_id, user_id);

-- Index for Stripe webhook lookups (stripe_subscription_id)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- Missing updated_at trigger on objects_types_overrides
CREATE TRIGGER objects_types_overrides_updated_at
    BEFORE UPDATE ON objects_types_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
