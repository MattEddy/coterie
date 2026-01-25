import Foundation
import SwiftData

enum RelationshipType: String, Codable, CaseIterable {
    // Company relationships
    case owns = "Owns"
    case subsidiaryOf = "Subsidiary Of"
    case hasDealAt = "Has Deal At"
    case finances = "Finances"

    // Person-Company relationships
    case employedBy = "Employed By"
    case represents = "Represents"
    case representedBy = "Represented By"

    // Person-Project relationships
    case attachedTo = "Attached To"
    case createdBy = "Created By"
    case writtenBy = "Written By"
    case directedBy = "Directed By"
    case producedBy = "Produced By"
    case starsIn = "Stars In"

    // Project-Company relationships
    case setUpAt = "Set Up At"
    case distributedBy = "Distributed By"
    case financedBy = "Financed By"
}

enum EntityType: String, Codable {
    case company
    case person
    case project
}

@Model
final class Relationship {
    var id: UUID
    var relationshipType: RelationshipType

    // Source entity (using optional references)
    var sourceType: EntityType
    @Relationship var sourceCompany: Company?
    @Relationship var sourcePerson: Person?
    @Relationship var sourceProject: Project?

    // Target entity
    var targetType: EntityType
    @Relationship var targetCompany: Company?
    @Relationship var targetPerson: Person?
    @Relationship var targetProject: Project?

    // Metadata
    var startedAt: Date?
    var endedAt: Date?
    var isCurrent: Bool
    var notes: String?
    var createdAt: Date
    var updatedAt: Date

    // Convenience initializers for common relationship patterns

    /// Person employed by Company
    static func employment(person: Person, company: Company, title: String? = nil, startedAt: Date? = nil) -> Relationship {
        let rel = Relationship(type: .employedBy, sourceType: .person, targetType: .company)
        rel.sourcePerson = person
        rel.targetCompany = company
        rel.startedAt = startedAt
        rel.notes = title
        return rel
    }

    /// Person attached to Project
    static func attachment(person: Person, project: Project, role: RelationshipType, notes: String? = nil) -> Relationship {
        let rel = Relationship(type: role, sourceType: .person, targetType: .project)
        rel.sourcePerson = person
        rel.targetProject = project
        rel.notes = notes
        return rel
    }

    /// Project set up at Company
    static func setup(project: Project, company: Company, notes: String? = nil) -> Relationship {
        let rel = Relationship(type: .setUpAt, sourceType: .project, targetType: .company)
        rel.sourceProject = project
        rel.targetCompany = company
        rel.notes = notes
        return rel
    }

    /// Company has deal at Company
    static func deal(prodco: Company, studio: Company, notes: String? = nil, startedAt: Date? = nil) -> Relationship {
        let rel = Relationship(type: .hasDealAt, sourceType: .company, targetType: .company)
        rel.sourceCompany = prodco
        rel.targetCompany = studio
        rel.startedAt = startedAt
        rel.notes = notes
        return rel
    }

    private init(type: RelationshipType, sourceType: EntityType, targetType: EntityType) {
        self.id = UUID()
        self.relationshipType = type
        self.sourceType = sourceType
        self.targetType = targetType
        self.isCurrent = true
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    init(
        relationshipType: RelationshipType,
        sourceType: EntityType,
        targetType: EntityType,
        isCurrent: Bool = true,
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        notes: String? = nil
    ) {
        self.id = UUID()
        self.relationshipType = relationshipType
        self.sourceType = sourceType
        self.targetType = targetType
        self.isCurrent = isCurrent
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.notes = notes
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
