-- =============================================================================
-- Subscriptions table — tracks trial, payment, and access tier per user
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(user_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'free', 'vip')),
    plan_id TEXT,                          -- e.g. 'pro_monthly_399', 'pro_annual_3900'
    trial_ends_at TIMESTAMPTZ,
    trial_duration_days INT NOT NULL DEFAULT 60,
    current_period_end TIMESTAMPTZ,
    coupon_code TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- =============================================================================
-- user_tier() — returns 'pro' | 'trial' | 'free' for access gating
-- =============================================================================

CREATE OR REPLACE FUNCTION user_tier(uid UUID)
RETURNS TEXT AS $$
DECLARE
    sub RECORD;
BEGIN
    SELECT status, trial_ends_at INTO sub
    FROM public.subscriptions
    WHERE user_id = uid;

    IF NOT FOUND THEN
        RETURN 'free';
    END IF;

    -- VIP and active subscribers get full access
    IF sub.status IN ('active', 'vip') THEN
        RETURN 'pro';
    END IF;

    -- Trialing: check if trial has expired
    IF sub.status = 'trialing' THEN
        IF sub.trial_ends_at IS NOT NULL AND sub.trial_ends_at > NOW() THEN
            RETURN 'trial';
        ELSE
            -- Trial expired — downgrade to free
            UPDATE public.subscriptions
            SET status = 'free', updated_at = NOW()
            WHERE user_id = uid AND status = 'trialing';
            RETURN 'free';
        END IF;
    END IF;

    -- past_due gets a grace period (still pro)
    IF sub.status = 'past_due' THEN
        RETURN 'pro';
    END IF;

    RETURN 'free';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- Update signup trigger to also create a subscription row
-- =============================================================================

CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id) VALUES (NEW.id);
    INSERT INTO public.subscriptions (user_id, status, trial_ends_at)
    VALUES (NEW.id, 'trialing', NOW() + INTERVAL '60 days');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill: create subscription rows for existing users who don't have one
INSERT INTO subscriptions (user_id, status, trial_ends_at)
SELECT p.user_id, 'vip', NULL
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id
);
