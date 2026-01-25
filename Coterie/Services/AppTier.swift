import Foundation

// MARK: - App Tier System

enum AppTier: String, CaseIterable {
    case free = "Free"
    case pro = "Pro"
    case studio = "Studio"

    var features: Set<Feature> {
        switch self {
        case .free:
            return [.keywordFiltering, .manualRefresh, .basicMap]
        case .pro:
            return Feature.allCases.filter { !Feature.studioOnly.contains($0) }.asSet()
        case .studio:
            return Set(Feature.allCases)
        }
    }

    func hasFeature(_ feature: Feature) -> Bool {
        features.contains(feature)
    }
}

enum Feature: String, CaseIterable {
    // Free
    case keywordFiltering
    case manualRefresh
    case basicMap

    // Pro
    case aiFiltering
    case autoRefresh
    case aiSuggestions

    // Studio
    case sharedIntelPool
    case teamAccess
    case apiAccess

    static let studioOnly: Set<Feature> = [.sharedIntelPool, .teamAccess, .apiAccess]
}

extension Collection where Element: Hashable {
    func asSet() -> Set<Element> {
        Set(self)
    }
}

// MARK: - Current Tier Manager

class TierManager: ObservableObject {
    static let shared = TierManager()

    @Published var currentTier: AppTier = .pro // Default to pro during development

    // In the future, this will check purchase status from Keychain/RevenueCat/etc.
    func refreshTierStatus() {
        // TODO: Check actual purchase status
        // For now, if user has API key, treat as pro
        if KeychainHelper.shared.getAnthropicAPIKey() != nil {
            currentTier = .pro
        } else {
            currentTier = .free
        }
    }
}
