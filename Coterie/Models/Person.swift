import Foundation
import SwiftData

@Model
final class Person {
    var id: UUID
    var name: String
    var title: String?
    var email: String?
    var phone: String?
    var notes: String?
    var createdAt: Date
    var updatedAt: Date

    // Hierarchy relationships
    @Relationship(inverse: \Person.directReports)
    var reportsTo: Person?

    @Relationship
    var directReports: [Person]?

    // Optional division association
    @Relationship
    var division: Division?

    init(
        name: String,
        title: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        notes: String? = nil,
        reportsTo: Person? = nil,
        division: Division? = nil
    ) {
        self.id = UUID()
        self.name = name
        self.title = title
        self.email = email
        self.phone = phone
        self.notes = notes
        self.reportsTo = reportsTo
        self.division = division
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
