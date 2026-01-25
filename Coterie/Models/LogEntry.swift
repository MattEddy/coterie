import Foundation
import SwiftData

@Model
final class LogEntry {
    var id: UUID
    var entryDate: Date
    var content: String
    var createdAt: Date
    var updatedAt: Date

    // Optional links to entities this entry is about
    @Relationship var company: Company?
    @Relationship var person: Person?
    @Relationship var project: Project?

    init(
        content: String,
        entryDate: Date = Date(),
        company: Company? = nil,
        person: Person? = nil,
        project: Project? = nil
    ) {
        self.id = UUID()
        self.entryDate = entryDate
        self.content = content
        self.company = company
        self.person = person
        self.project = project
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
