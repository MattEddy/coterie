import SwiftUI
import SwiftData

struct ProjectsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Project.title) private var projects: [Project]
    @State private var searchText = ""
    @State private var showingAddSheet = false
    @State private var selectedProject: Project?
    @State private var statusFilter: ProjectStatus?

    var filteredProjects: [Project] {
        var result = projects

        if let statusFilter {
            result = result.filter { $0.status == statusFilter }
        }

        if !searchText.isEmpty {
            result = result.filter {
                $0.title.localizedCaseInsensitiveContains(searchText) ||
                ($0.logline?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }

        return result
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Status filter
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "All", isSelected: statusFilter == nil) {
                            statusFilter = nil
                        }
                        ForEach(ProjectStatus.allCases, id: \.self) { status in
                            FilterChip(title: status.rawValue, isSelected: statusFilter == status) {
                                statusFilter = status
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }

                Divider()

                List(filteredProjects, selection: $selectedProject) { project in
                    ProjectRow(project: project)
                        .tag(project)
                }
            }
            .searchable(text: $searchText, prompt: "Search projects")
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingAddSheet = true }) {
                        Label("Add Project", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddProjectSheet()
            }
            .sheet(item: $selectedProject) { project in
                ProjectDetailSheet(project: project)
            }
        }
    }
}

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.accentColor : Color.secondary.opacity(0.2))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(16)
        }
        .buttonStyle(.plain)
    }
}

struct ProjectRow: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(project.title)
                    .font(.headline)
                Spacer()
                StatusBadge(status: project.status)
            }
            HStack {
                Text(project.type.rawValue)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let genre = project.genre {
                    Text("•")
                        .foregroundStyle(.secondary)
                    Text(genre)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let logline = project.logline {
                Text(logline)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }
}

struct StatusBadge: View {
    let status: ProjectStatus

    var color: Color {
        switch status {
        case .development: return .blue
        case .preProduction: return .orange
        case .production: return .green
        case .postProduction: return .purple
        case .completed: return .gray
        case .released: return .green
        case .cancelled: return .red
        case .turnaround: return .yellow
        }
    }

    var body: some View {
        Text(status.rawValue)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .cornerRadius(4)
    }
}

struct AddProjectSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var type: ProjectType = .feature
    @State private var status: ProjectStatus = .development
    @State private var logline = ""
    @State private var genre = ""
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                Picker("Type", selection: $type) {
                    ForEach(ProjectType.allCases, id: \.self) { type in
                        Text(type.rawValue).tag(type)
                    }
                }
                Picker("Status", selection: $status) {
                    ForEach(ProjectStatus.allCases, id: \.self) { status in
                        Text(status.rawValue).tag(status)
                    }
                }
                TextField("Genre", text: $genre)
                TextField("Logline", text: $logline, axis: .vertical)
                    .lineLimit(2...4)
                TextField("Notes", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }
            .padding()
            .frame(minWidth: 450, minHeight: 400)
            .navigationTitle("Add Project")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let project = Project(
                            title: title,
                            type: type,
                            status: status,
                            logline: logline.isEmpty ? nil : logline,
                            genre: genre.isEmpty ? nil : genre,
                            notes: notes.isEmpty ? nil : notes
                        )
                        modelContext.insert(project)
                        dismiss()
                    }
                    .disabled(title.isEmpty)
                }
            }
        }
    }
}

struct ProjectDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var project: Project

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $project.title)
                Picker("Type", selection: $project.type) {
                    ForEach(ProjectType.allCases, id: \.self) { type in
                        Text(type.rawValue).tag(type)
                    }
                }
                Picker("Status", selection: $project.status) {
                    ForEach(ProjectStatus.allCases, id: \.self) { status in
                        Text(status.rawValue).tag(status)
                    }
                }
                TextField("Genre", text: Binding(
                    get: { project.genre ?? "" },
                    set: { project.genre = $0.isEmpty ? nil : $0 }
                ))
                TextField("Logline", text: Binding(
                    get: { project.logline ?? "" },
                    set: { project.logline = $0.isEmpty ? nil : $0 }
                ), axis: .vertical)
                    .lineLimit(2...4)
                TextField("Notes", text: Binding(
                    get: { project.notes ?? "" },
                    set: { project.notes = $0.isEmpty ? nil : $0 }
                ), axis: .vertical)
                    .lineLimit(3...6)

                Section("Info") {
                    LabeledContent("Created", value: project.createdAt.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Updated", value: project.updatedAt.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .padding()
            .frame(minWidth: 450, minHeight: 450)
            .navigationTitle("Edit Project")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    ProjectsView()
        .modelContainer(for: Project.self, inMemory: true)
}
