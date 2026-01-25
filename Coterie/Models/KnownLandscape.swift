import Foundation

// MARK: - Known Landscape Data Model

struct KnownLandscape: Codable {
    let version: String
    let updated: String
    let description: String
    let tiers: [String: String]
    let companies: [KnownCompany]
    let agencies: [KnownCompany]
    let managementCompanies: [KnownCompany]
    let specialties: [String]
    let locations: [String]

    enum CodingKeys: String, CodingKey {
        case version, updated, description, tiers, companies, agencies, specialties, locations
        case managementCompanies = "management_companies"
    }

    var allCompanies: [KnownCompany] {
        companies + agencies + managementCompanies
    }

    var majorCompanies: [KnownCompany] {
        companies.filter { $0.tier == "majors" }
    }

    var topProdcos: [KnownCompany] {
        companies.filter { $0.tier == "top_prodcos" }
    }

    var notableCompanies: [KnownCompany] {
        companies.filter { $0.tier == "notable" }
    }
}

struct KnownCompany: Codable, Identifiable, Hashable {
    var id: String { name }

    let name: String
    let type: String
    let tier: String?
    let parent: String?
    let specialty: [String]?
    let location: String?
    let principals: [String]?
    let deal: String?
    let notes: String?

    var displayType: String {
        switch type {
        case "studio": return "Studio"
        case "production_company": return "Production Company"
        case "financier": return "Financier"
        case "agency": return "Agency"
        case "management": return "Management"
        case "network": return "Network"
        case "streamer": return "Streamer"
        case "distributor": return "Distributor"
        default: return "Other"
        }
    }

    var specialtiesDisplay: String {
        specialty?.joined(separator: ", ") ?? ""
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(name)
    }

    static func == (lhs: KnownCompany, rhs: KnownCompany) -> Bool {
        lhs.name == rhs.name
    }
}

// MARK: - Landscape Loader

class LandscapeLoader {
    static let shared = LandscapeLoader()

    private var cachedLandscape: KnownLandscape?

    func load() -> KnownLandscape? {
        if let cached = cachedLandscape {
            return cached
        }

        // Try to load from bundle first
        if let bundleURL = Bundle.main.url(forResource: "known_landscape", withExtension: "json"),
           let data = try? Data(contentsOf: bundleURL) {
            return decode(data)
        }

        // Fall back to scripts directory (for development)
        let scriptsPath = FileManager.default.currentDirectoryPath + "/scripts/known_landscape.json"
        if let data = try? Data(contentsOf: URL(fileURLWithPath: scriptsPath)) {
            return decode(data)
        }

        // Try relative to home directory
        let homePath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("code/coterie/scripts/known_landscape.json")
        if let data = try? Data(contentsOf: homePath) {
            return decode(data)
        }

        return nil
    }

    private func decode(_ data: Data) -> KnownLandscape? {
        let decoder = JSONDecoder()
        do {
            let landscape = try decoder.decode(KnownLandscape.self, from: data)
            cachedLandscape = landscape
            return landscape
        } catch {
            print("Error decoding known_landscape.json: \(error)")
            return nil
        }
    }

    func reload() -> KnownLandscape? {
        cachedLandscape = nil
        return load()
    }
}
