import SwiftUI
import SwiftData

struct CompaniesView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Company.name) private var companies: [Company]
    @State private var searchText = ""
    @State private var showingAddSheet = false
    @State private var selectedCompany: Company?

    var filteredCompanies: [Company] {
        if searchText.isEmpty {
            return companies
        }
        return companies.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            List(filteredCompanies, selection: $selectedCompany) { company in
                CompanyRow(company: company)
                    .tag(company)
            }
            .searchable(text: $searchText, prompt: "Search companies")
            .navigationTitle("Companies")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingAddSheet = true }) {
                        Label("Add Company", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddCompanySheet()
            }
            .sheet(item: $selectedCompany) { company in
                CompanyDetailSheet(company: company)
            }
        }
    }
}

struct CompanyRow: View {
    let company: Company

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(company.name)
                .font(.headline)
            Text(company.type.rawValue)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct AddCompanySheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var type: CompanyType = .productionCompany
    @State private var website = ""
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                Picker("Type", selection: $type) {
                    ForEach(CompanyType.allCases, id: \.self) { type in
                        Text(type.rawValue).tag(type)
                    }
                }
                TextField("Website", text: $website)
                TextField("Notes", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }
            .padding()
            .frame(minWidth: 400, minHeight: 300)
            .navigationTitle("Add Company")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let company = Company(
                            name: name,
                            type: type,
                            website: website.isEmpty ? nil : website,
                            notes: notes.isEmpty ? nil : notes
                        )
                        modelContext.insert(company)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}

struct CompanyDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var company: Company

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $company.name)
                Picker("Type", selection: $company.type) {
                    ForEach(CompanyType.allCases, id: \.self) { type in
                        Text(type.rawValue).tag(type)
                    }
                }
                TextField("Website", text: Binding(
                    get: { company.website ?? "" },
                    set: { company.website = $0.isEmpty ? nil : $0 }
                ))
                TextField("Notes", text: Binding(
                    get: { company.notes ?? "" },
                    set: { company.notes = $0.isEmpty ? nil : $0 }
                ), axis: .vertical)
                    .lineLimit(3...6)

                Section("Info") {
                    LabeledContent("Created", value: company.createdAt.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Updated", value: company.updatedAt.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .padding()
            .frame(minWidth: 400, minHeight: 350)
            .navigationTitle("Edit Company")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    CompaniesView()
        .modelContainer(for: Company.self, inMemory: true)
}
