import Foundation
import SwiftData

@Model
final class Division {
    var id: UUID
    var name: String
    var notes: String?
    var createdAt: Date
    var updatedAt: Date

    // Parent company
    @Relationship
    var company: Company?

    // Division head (optional)
    @Relationship
    var head: Person?

    init(
        name: String,
        notes: String? = nil,
        company: Company? = nil,
        head: Person? = nil
    ) {
        self.id = UUID()
        self.name = name
        self.notes = notes
        self.company = company
        self.head = head
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
