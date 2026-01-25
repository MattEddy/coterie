import Foundation
import Security

// MARK: - Keychain Helper

class KeychainHelper {
    static let shared = KeychainHelper()

    private let service = "com.sparrowstep.coterie"

    private enum Keys {
        static let anthropicAPIKey = "anthropic_api_key"
    }

    // MARK: - Anthropic API Key

    func setAnthropicAPIKey(_ key: String) -> Bool {
        return set(key, forKey: Keys.anthropicAPIKey)
    }

    func getAnthropicAPIKey() -> String? {
        return get(forKey: Keys.anthropicAPIKey)
    }

    func deleteAnthropicAPIKey() -> Bool {
        return delete(forKey: Keys.anthropicAPIKey)
    }

    // MARK: - Generic Keychain Operations

    private func set(_ value: String, forKey key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }

        // Delete existing item first
        _ = delete(forKey: key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    private func get(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }

        return string
    }

    private func delete(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
