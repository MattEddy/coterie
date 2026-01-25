import Foundation
import Contacts

// MARK: - Fuzzy String Matching

struct FuzzyMatcher {
    /// Common company suffixes to strip for matching
    private static let companySuffixes = [
        "inc", "inc.", "incorporated",
        "llc", "l.l.c.",
        "corp", "corp.", "corporation",
        "co", "co.", "company",
        "ltd", "ltd.", "limited",
        "entertainment", "pictures", "films", "studios", "studio",
        "productions", "production", "media", "group", "holdings"
    ]

    /// Normalize a company name for matching
    static func normalize(_ name: String) -> String {
        var result = name.lowercased()

        // Remove punctuation except spaces
        result = result.replacingOccurrences(of: "[^a-z0-9 ]", with: "", options: .regularExpression)

        // Remove common suffixes
        var words = result.split(separator: " ").map(String.init)
        words = words.filter { !companySuffixes.contains($0) }

        return words.joined(separator: " ").trimmingCharacters(in: .whitespaces)
    }

    /// Check if two company names are a fuzzy match
    static func isMatch(_ name1: String, _ name2: String, threshold: Double = 0.8) -> Bool {
        let n1 = normalize(name1)
        let n2 = normalize(name2)

        // Exact match after normalization
        if n1 == n2 { return true }

        // Empty check
        if n1.isEmpty || n2.isEmpty { return false }

        // Containment check (one contains the other)
        if n1.contains(n2) || n2.contains(n1) { return true }

        // Word overlap check
        let words1 = Set(n1.split(separator: " ").map(String.init))
        let words2 = Set(n2.split(separator: " ").map(String.init))
        let intersection = words1.intersection(words2)

        // If significant word overlap, it's a match
        let overlapRatio = Double(intersection.count) / Double(min(words1.count, words2.count))
        if overlapRatio >= 0.5 && !intersection.isEmpty { return true }

        // Levenshtein similarity for catching typos
        let similarity = levenshteinSimilarity(n1, n2)
        return similarity >= threshold
    }

    /// Calculate Levenshtein similarity (0.0 to 1.0)
    static func levenshteinSimilarity(_ s1: String, _ s2: String) -> Double {
        let distance = levenshteinDistance(s1, s2)
        let maxLen = max(s1.count, s2.count)
        if maxLen == 0 { return 1.0 }
        return 1.0 - (Double(distance) / Double(maxLen))
    }

    /// Calculate Levenshtein edit distance
    static func levenshteinDistance(_ s1: String, _ s2: String) -> Int {
        let a = Array(s1)
        let b = Array(s2)

        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }

        var matrix = [[Int]](repeating: [Int](repeating: 0, count: b.count + 1), count: a.count + 1)

        for i in 0...a.count { matrix[i][0] = i }
        for j in 0...b.count { matrix[0][j] = j }

        for i in 1...a.count {
            for j in 1...b.count {
                let cost = a[i-1] == b[j-1] ? 0 : 1
                matrix[i][j] = min(
                    matrix[i-1][j] + 1,      // deletion
                    matrix[i][j-1] + 1,      // insertion
                    matrix[i-1][j-1] + cost  // substitution
                )
            }
        }

        return matrix[a.count][b.count]
    }

    /// Find the best matching company name from a set, returns (matchedName, score) or nil
    static func bestMatch(for name: String, in candidates: Set<String>, threshold: Double = 0.8) -> (String, Double)? {
        let normalized = normalize(name)
        if normalized.isEmpty { return nil }

        var bestMatch: String?
        var bestScore: Double = 0

        for candidate in candidates {
            let candidateNorm = normalize(candidate)

            // Exact match
            if normalized == candidateNorm {
                return (candidate, 1.0)
            }

            // Containment
            if normalized.contains(candidateNorm) || candidateNorm.contains(normalized) {
                let score = 0.95
                if score > bestScore {
                    bestScore = score
                    bestMatch = candidate
                }
                continue
            }

            // Similarity
            let similarity = levenshteinSimilarity(normalized, candidateNorm)
            if similarity > bestScore && similarity >= threshold {
                bestScore = similarity
                bestMatch = candidate
            }
        }

        if let match = bestMatch {
            return (match, bestScore)
        }
        return nil
    }
}

// MARK: - Contact Model

struct ContactEntry: Identifiable, Hashable {
    let id: String  // CNContact identifier
    let givenName: String
    let familyName: String
    let organizationName: String
    let jobTitle: String
    let emailAddresses: [String]
    let phoneNumbers: [String]

    var fullName: String {
        [givenName, familyName].filter { !$0.isEmpty }.joined(separator: " ")
    }

    var displayName: String {
        fullName.isEmpty ? organizationName : fullName
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: ContactEntry, rhs: ContactEntry) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Contacts Service

@MainActor
class ContactsService: ObservableObject {
    static let shared = ContactsService()

    @Published var contacts: [ContactEntry] = []
    @Published var authorizationStatus: CNAuthorizationStatus = .notDetermined
    @Published var isLoading = false
    @Published var lastError: String?

    private let store = CNContactStore()

    private init() {
        updateAuthorizationStatus()
    }

    func updateAuthorizationStatus() {
        authorizationStatus = CNContactStore.authorizationStatus(for: .contacts)
    }

    func requestAccess() async -> Bool {
        do {
            let granted = try await store.requestAccess(for: .contacts)
            updateAuthorizationStatus()
            return granted
        } catch {
            lastError = error.localizedDescription
            updateAuthorizationStatus()
            return false
        }
    }

    func fetchContacts() async {
        if authorizationStatus != .authorized {
            let granted = await requestAccess()
            if !granted { return }
        }

        isLoading = true
        lastError = nil

        let keysToFetch: [CNKeyDescriptor] = [
            CNContactIdentifierKey as CNKeyDescriptor,
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactOrganizationNameKey as CNKeyDescriptor,
            CNContactJobTitleKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor
        ]

        let request = CNContactFetchRequest(keysToFetch: keysToFetch)
        request.sortOrder = .familyName

        var fetchedContacts: [ContactEntry] = []

        do {
            try store.enumerateContacts(with: request) { contact, _ in
                let entry = ContactEntry(
                    id: contact.identifier,
                    givenName: contact.givenName,
                    familyName: contact.familyName,
                    organizationName: contact.organizationName,
                    jobTitle: contact.jobTitle,
                    emailAddresses: contact.emailAddresses.map { $0.value as String },
                    phoneNumbers: contact.phoneNumbers.map { $0.value.stringValue }
                )

                // Only include contacts with a name
                if !entry.displayName.isEmpty {
                    fetchedContacts.append(entry)
                }
            }

            contacts = fetchedContacts
        } catch {
            lastError = error.localizedDescription
        }

        isLoading = false
    }

    /// Returns contacts whose organization matches any of the provided company names
    func contactsMatchingCompanies(_ companyNames: Set<String>) -> [ContactEntry] {
        let lowercasedNames = Set(companyNames.map { $0.lowercased() })

        return contacts.filter { contact in
            guard !contact.organizationName.isEmpty else { return false }
            let orgLower = contact.organizationName.lowercased()

            // Check for exact match or if org contains company name
            return lowercasedNames.contains(orgLower) ||
                   lowercasedNames.contains { orgLower.contains($0) || $0.contains(orgLower) }
        }
    }

    /// Groups contacts by their organization
    func contactsByOrganization() -> [String: [ContactEntry]] {
        var grouped: [String: [ContactEntry]] = [:]

        for contact in contacts {
            let org = contact.organizationName.isEmpty ? "No Company" : contact.organizationName
            grouped[org, default: []].append(contact)
        }

        return grouped
    }
}
