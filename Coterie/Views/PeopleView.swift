import SwiftUI
import SwiftData

struct PeopleView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Person.name) private var people: [Person]
    @State private var searchText = ""
    @State private var showingAddSheet = false
    @State private var selectedPerson: Person?

    var filteredPeople: [Person] {
        if searchText.isEmpty {
            return people
        }
        return people.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            ($0.title?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            List(filteredPeople, selection: $selectedPerson) { person in
                PersonRow(person: person)
                    .tag(person)
            }
            .searchable(text: $searchText, prompt: "Search people")
            .navigationTitle("People")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingAddSheet = true }) {
                        Label("Add Person", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddPersonSheet()
            }
            .sheet(item: $selectedPerson) { person in
                PersonDetailSheet(person: person)
            }
        }
    }
}

struct PersonRow: View {
    let person: Person

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(person.name)
                .font(.headline)
            if let title = person.title {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct AddPersonSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var title = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                TextField("Title", text: $title)
                TextField("Email", text: $email)
                TextField("Phone", text: $phone)
                TextField("Notes", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }
            .padding()
            .frame(minWidth: 400, minHeight: 350)
            .navigationTitle("Add Person")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let person = Person(
                            name: name,
                            title: title.isEmpty ? nil : title,
                            email: email.isEmpty ? nil : email,
                            phone: phone.isEmpty ? nil : phone,
                            notes: notes.isEmpty ? nil : notes
                        )
                        modelContext.insert(person)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}

struct PersonDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var person: Person

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $person.name)
                TextField("Title", text: Binding(
                    get: { person.title ?? "" },
                    set: { person.title = $0.isEmpty ? nil : $0 }
                ))
                TextField("Email", text: Binding(
                    get: { person.email ?? "" },
                    set: { person.email = $0.isEmpty ? nil : $0 }
                ))
                TextField("Phone", text: Binding(
                    get: { person.phone ?? "" },
                    set: { person.phone = $0.isEmpty ? nil : $0 }
                ))
                TextField("Notes", text: Binding(
                    get: { person.notes ?? "" },
                    set: { person.notes = $0.isEmpty ? nil : $0 }
                ), axis: .vertical)
                    .lineLimit(3...6)

                Section("Info") {
                    LabeledContent("Created", value: person.createdAt.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Updated", value: person.updatedAt.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .padding()
            .frame(minWidth: 400, minHeight: 400)
            .navigationTitle("Edit Person")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    PeopleView()
        .modelContainer(for: Person.self, inMemory: true)
}
