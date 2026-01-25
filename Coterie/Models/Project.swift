import Foundation
import SwiftData

enum ProjectType: String, Codable, CaseIterable {
    case feature = "Feature"
    case tvSeries = "TV Series"
    case limitedSeries = "Limited Series"
    case pilot = "Pilot"
    case documentary = "Documentary"
    case short = "Short"
    case other = "Other"
}

enum ProjectStatus: String, Codable, CaseIterable {
    case development = "Development"
    case preProduction = "Pre-Production"
    case production = "Production"
    case postProduction = "Post-Production"
    case completed = "Completed"
    case released = "Released"
    case cancelled = "Cancelled"
    case turnaround = "Turnaround"
}

@Model
final class Project {
    var id: UUID
    var title: String
    var type: ProjectType
    var status: ProjectStatus
    var logline: String?
    var genre: String?
    var notes: String?
    var createdAt: Date
    var updatedAt: Date

    // Optional division association (e.g., Warner Bros Television)
    @Relationship
    var division: Division?

    init(
        title: String,
        type: ProjectType,
        status: ProjectStatus = .development,
        logline: String? = nil,
        genre: String? = nil,
        notes: String? = nil,
        division: Division? = nil
    ) {
        self.id = UUID()
        self.title = title
        self.type = type
        self.status = status
        self.logline = logline
        self.genre = genre
        self.notes = notes
        self.division = division
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
