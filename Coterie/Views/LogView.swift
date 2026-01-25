import SwiftUI
import SwiftData

struct LogView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \LogEntry.entryDate, order: .reverse) private var entries: [LogEntry]
    @State private var searchText = ""
    @State private var showingAddSheet = false
    @State private var selectedEntry: LogEntry?

    var filteredEntries: [LogEntry] {
        if searchText.isEmpty {
            return entries
        }
        return entries.filter { $0.content.localizedCaseInsensitiveContains(searchText) }
    }

    var groupedEntries: [(Date, [LogEntry])] {
        let grouped = Dictionary(grouping: filteredEntries) { entry in
            Calendar.current.startOfDay(for: entry.entryDate)
        }
        return grouped.sorted { $0.key > $1.key }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(groupedEntries, id: \.0) { date, entries in
                    Section(header: Text(date.formatted(date: .complete, time: .omitted))) {
                        ForEach(entries) { entry in
                            LogEntryRow(entry: entry)
                                .onTapGesture {
                                    selectedEntry = entry
                                }
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                modelContext.delete(entries[index])
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search log")
            .navigationTitle("Log")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingAddSheet = true }) {
                        Label("Add Entry", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddLogEntrySheet()
            }
            .sheet(item: $selectedEntry) { entry in
                LogEntryDetailSheet(entry: entry)
            }
        }
    }
}

struct LogEntryRow: View {
    let entry: LogEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.content)
                .font(.body)
                .lineLimit(3)

            HStack(spacing: 8) {
                if let company = entry.company {
                    Label(company.name, systemImage: "building.2")
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
                if let person = entry.person {
                    Label(person.name, systemImage: "person")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                if let project = entry.project {
                    Label(project.title, systemImage: "film")
                        .font(.caption)
                        .foregroundStyle(.purple)
                }
            }

            Text(entry.createdAt.formatted(date: .omitted, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct AddLogEntrySheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @Query(sort: \Company.name) private var companies: [Company]
    @Query(sort: \Person.name) private var people: [Person]
    @Query(sort: \Project.title) private var projects: [Project]

    @State private var content = ""
    @State private var entryDate = Date()
    @State private var selectedCompany: Company?
    @State private var selectedPerson: Person?
    @State private var selectedProject: Project?

    var body: some View {
        NavigationStack {
            Form {
                Section("Entry") {
                    DatePicker("Date", selection: $entryDate, displayedComponents: .date)
                    TextField("What did you learn?", text: $content, axis: .vertical)
                        .lineLimit(5...10)
                }

                Section("Link to (optional)") {
                    Picker("Company", selection: $selectedCompany) {
                        Text("None").tag(nil as Company?)
                        ForEach(companies) { company in
                            Text(company.name).tag(company as Company?)
                        }
                    }
                    Picker("Person", selection: $selectedPerson) {
                        Text("None").tag(nil as Person?)
                        ForEach(people) { person in
                            Text(person.name).tag(person as Person?)
                        }
                    }
                    Picker("Project", selection: $selectedProject) {
                        Text("None").tag(nil as Project?)
                        ForEach(projects) { project in
                            Text(project.title).tag(project as Project?)
                        }
                    }
                }
            }
            .padding()
            .frame(minWidth: 450, minHeight: 400)
            .navigationTitle("Add Log Entry")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let entry = LogEntry(
                            content: content,
                            entryDate: entryDate,
                            company: selectedCompany,
                            person: selectedPerson,
                            project: selectedProject
                        )
                        modelContext.insert(entry)
                        dismiss()
                    }
                    .disabled(content.isEmpty)
                }
            }
        }
    }
}

struct LogEntryDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var entry: LogEntry

    @Query(sort: \Company.name) private var companies: [Company]
    @Query(sort: \Person.name) private var people: [Person]
    @Query(sort: \Project.title) private var projects: [Project]

    var body: some View {
        NavigationStack {
            Form {
                Section("Entry") {
                    DatePicker("Date", selection: $entry.entryDate, displayedComponents: .date)
                    TextField("Content", text: $entry.content, axis: .vertical)
                        .lineLimit(5...10)
                }

                Section("Linked to") {
                    Picker("Company", selection: $entry.company) {
                        Text("None").tag(nil as Company?)
                        ForEach(companies) { company in
                            Text(company.name).tag(company as Company?)
                        }
                    }
                    Picker("Person", selection: $entry.person) {
                        Text("None").tag(nil as Person?)
                        ForEach(people) { person in
                            Text(person.name).tag(person as Person?)
                        }
                    }
                    Picker("Project", selection: $entry.project) {
                        Text("None").tag(nil as Project?)
                        ForEach(projects) { project in
                            Text(project.title).tag(project as Project?)
                        }
                    }
                }

                Section("Info") {
                    LabeledContent("Created", value: entry.createdAt.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Updated", value: entry.updatedAt.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .padding()
            .frame(minWidth: 450, minHeight: 450)
            .navigationTitle("Edit Entry")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    LogView()
        .modelContainer(for: [LogEntry.self, Company.self, Person.self, Project.self], inMemory: true)
}
