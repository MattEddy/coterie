import Foundation
import SwiftData
import CoreGraphics

enum CompanyType: String, Codable, CaseIterable {
    case studio = "Studio"
    case productionCompany = "Production Company"
    case financier = "Financier"
    case agency = "Agency"
    case management = "Management"
    case network = "Network"
    case streamer = "Streamer"
    case distributor = "Distributor"
    case other = "Other"
}

@Model
final class Company {
    var id: UUID
    var name: String
    var type: CompanyType
    var website: String?
    var notes: String?
    var createdAt: Date
    var updatedAt: Date

    // Map position (nil = not yet placed)
    var mapX: Double?
    var mapY: Double?

    // Relationships
    @Relationship(inverse: \Company.subsidiaries)
    var parentCompany: Company?

    @Relationship
    var subsidiaries: [Company]?

    @Relationship(deleteRule: .cascade, inverse: \Division.company)
    var divisions: [Division]?

    init(
        name: String,
        type: CompanyType,
        website: String? = nil,
        notes: String? = nil,
        parentCompany: Company? = nil
    ) {
        self.id = UUID()
        self.name = name
        self.type = type
        self.website = website
        self.notes = notes
        self.parentCompany = parentCompany
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var mapPosition: CGPoint? {
        get {
            guard let x = mapX, let y = mapY else { return nil }
            return CGPoint(x: x, y: y)
        }
        set {
            mapX = newValue.map { Double($0.x) }
            mapY = newValue.map { Double($0.y) }
            updatedAt = Date()
        }
    }
}
