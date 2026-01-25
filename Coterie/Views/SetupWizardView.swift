import SwiftUI

struct SetupWizardView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var database = LocalDatabase.shared

    @State private var currentStep = 0
    @State private var landscape: KnownLandscape?

    // Selection state
    @State private var includeMajors = true
    @State private var includeTopProdcos = true
    @State private var includeAgencies = true
    @State private var selectedNotable: Set<String> = []

    // Filter state for notable companies
    @State private var specialtyFilter: String?
    @State private var locationFilter: String?
    @State private var searchText = ""

    @State private var isImporting = false
    @State private var importProgress = 0.0
    @State private var importStatus = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header
            header

            Divider()

            // Content
            Group {
                switch currentStep {
                case 0:
                    welcomeStep
                case 1:
                    tiersStep
                case 2:
                    notableStep
                case 3:
                    confirmStep
                case 4:
                    importingStep
                default:
                    completeStep
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            // Footer with navigation
            footer
        }
        .frame(width: 700, height: 550)
        .onAppear {
            landscape = LandscapeLoader.shared.load()
        }
    }

    // MARK: - Header

    var header: some View {
        VStack(spacing: 4) {
            Text("Setup Coterie")
                .font(.headline)
            Text("Import the Known Landscape")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Progress dots
            HStack(spacing: 8) {
                ForEach(0..<5) { step in
                    Circle()
                        .fill(step <= currentStep ? Color.accentColor : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.top, 8)
        }
        .padding()
    }

    // MARK: - Step 0: Welcome

    var welcomeStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "building.2.crop.circle")
                .font(.system(size: 60))
                .foregroundColor(.accentColor)

            Text("Welcome to Coterie")
                .font(.title)

            Text("Let's set up your industry map by importing the Known Landscape — a curated database of studios, production companies, and industry players.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 450)

            VStack(alignment: .leading, spacing: 12) {
                Label("~30 major studios and streamers", systemImage: "checkmark.circle.fill")
                Label("~40 top production companies", systemImage: "checkmark.circle.fill")
                Label("~60 notable independents (optional)", systemImage: "checkmark.circle")
                Label("Major agencies and management", systemImage: "checkmark.circle.fill")
            }
            .foregroundStyle(.secondary)
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(8)
        }
        .padding()
    }

    // MARK: - Step 1: Select Tiers

    var tiersStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Select Company Tiers")
                .font(.title2)

            Text("Choose which tiers to include in your initial import:")
                .foregroundStyle(.secondary)

            VStack(spacing: 16) {
                TierToggle(
                    title: "Major Studios & Streamers",
                    description: "Disney, Warner Bros, Universal, Netflix, Amazon, etc.",
                    count: landscape?.majorCompanies.count ?? 0,
                    isOn: $includeMajors,
                    recommended: true
                )

                TierToggle(
                    title: "Top Production Companies",
                    description: "Bad Robot, Blumhouse, A24, Plan B, Legendary, etc.",
                    count: landscape?.topProdcos.count ?? 0,
                    isOn: $includeTopProdcos,
                    recommended: true
                )

                TierToggle(
                    title: "Agencies & Management",
                    description: "CAA, WME, UTA, Management 360, etc.",
                    count: (landscape?.agencies.count ?? 0) + (landscape?.managementCompanies.count ?? 0),
                    isOn: $includeAgencies,
                    recommended: true
                )
            }

            Spacer()

            Text("You can always add more companies later.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(30)
    }

    // MARK: - Step 2: Select Notable Companies

    var notableStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Notable Companies")
                    .font(.title2)
                Spacer()
                Text("\(selectedNotable.count) selected")
                    .foregroundStyle(.secondary)
            }

            Text("Optionally add genre specialists, independents, and emerging players:")
                .foregroundStyle(.secondary)

            // Filters
            HStack {
                TextField("Search...", text: $searchText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)

                Picker("Specialty", selection: $specialtyFilter) {
                    Text("All Specialties").tag(nil as String?)
                    ForEach(landscape?.specialties ?? [], id: \.self) { specialty in
                        Text(specialty.capitalized).tag(specialty as String?)
                    }
                }
                .frame(width: 150)

                Picker("Location", selection: $locationFilter) {
                    Text("All Locations").tag(nil as String?)
                    ForEach(landscape?.locations ?? [], id: \.self) { location in
                        Text(location).tag(location as String?)
                    }
                }
                .frame(width: 180)

                Spacer()

                Button("Select All") {
                    selectedNotable = Set(filteredNotable.map { $0.name })
                }
                Button("Clear") {
                    selectedNotable.removeAll()
                }
            }

            // Company list
            List(filteredNotable, id: \.name, selection: $selectedNotable) { company in
                NotableCompanyRow(company: company, isSelected: selectedNotable.contains(company.name))
                    .tag(company.name)
            }
            .listStyle(.bordered)
        }
        .padding(30)
    }

    var filteredNotable: [KnownCompany] {
        guard let landscape else { return [] }

        return landscape.notableCompanies.filter { company in
            // Search filter
            if !searchText.isEmpty {
                let matchesName = company.name.localizedCaseInsensitiveContains(searchText)
                let matchesPrincipals = company.principals?.contains { $0.localizedCaseInsensitiveContains(searchText) } ?? false
                if !matchesName && !matchesPrincipals {
                    return false
                }
            }

            // Specialty filter
            if let specialty = specialtyFilter {
                if !(company.specialty?.contains(specialty) ?? false) {
                    return false
                }
            }

            // Location filter
            if let location = locationFilter {
                if company.location != location {
                    return false
                }
            }

            return true
        }
    }

    // MARK: - Step 3: Confirm

    var confirmStep: some View {
        VStack(spacing: 20) {
            Text("Ready to Import")
                .font(.title2)

            Text("The following will be added to your Coterie database:")
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 12) {
                if includeMajors {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("\(landscape?.majorCompanies.count ?? 0) major studios & streamers")
                    }
                }
                if includeTopProdcos {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("\(landscape?.topProdcos.count ?? 0) top production companies")
                    }
                }
                if includeAgencies {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("\((landscape?.agencies.count ?? 0) + (landscape?.managementCompanies.count ?? 0)) agencies & management companies")
                    }
                }
                if !selectedNotable.isEmpty {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("\(selectedNotable.count) notable companies")
                    }
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(8)

            Divider()

            Text("Total: \(totalCompanyCount) companies")
                .font(.headline)

            if let principals = totalPrincipalsCount, principals > 0 {
                Text("Plus \(principals) key people (producers, executives)")
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text("This will create the foundation of your industry map. You can add, edit, or remove entries at any time.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(30)
    }

    var totalCompanyCount: Int {
        var count = 0
        if includeMajors { count += landscape?.majorCompanies.count ?? 0 }
        if includeTopProdcos { count += landscape?.topProdcos.count ?? 0 }
        if includeAgencies { count += (landscape?.agencies.count ?? 0) + (landscape?.managementCompanies.count ?? 0) }
        count += selectedNotable.count
        return count
    }

    var totalPrincipalsCount: Int? {
        guard let landscape else { return nil }

        var companies: [KnownCompany] = []
        if includeMajors { companies += landscape.majorCompanies }
        if includeTopProdcos { companies += landscape.topProdcos }
        let notable = landscape.notableCompanies.filter { selectedNotable.contains($0.name) }
        companies += notable

        let principals = companies.compactMap { $0.principals }.flatMap { $0 }
        return Set(principals).count
    }

    // MARK: - Step 4: Importing

    var importingStep: some View {
        VStack(spacing: 20) {
            ProgressView(value: importProgress)
                .progressViewStyle(.linear)
                .frame(width: 300)

            Text(importStatus)
                .foregroundStyle(.secondary)

            if isImporting {
                ProgressView()
                    .scaleEffect(0.8)
            }
        }
        .padding(30)
        .onAppear {
            performImport()
        }
    }

    // MARK: - Step 5: Complete

    @State private var showingContactPicker = false

    var completeStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("Import Complete!")
                .font(.title)

            Text("Your industry map is ready. You can now browse companies, add people, track projects, and log intel.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 400)

            Divider()
                .padding(.vertical)

            VStack(spacing: 12) {
                Text("Add people from your contacts?")
                    .font(.headline)

                Text("Contacts at matching companies will be pre-selected. Others can be added manually.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    showingContactPicker = true
                } label: {
                    Label("Import from Contacts", systemImage: "person.crop.circle.badge.plus")
                }
                .buttonStyle(.bordered)
            }

            Spacer()
        }
        .padding(30)
        .sheet(isPresented: $showingContactPicker) {
            ContactPickerView()
        }
    }

    // MARK: - Footer

    var footer: some View {
        HStack {
            if currentStep > 0 && currentStep < 4 {
                Button("Back") {
                    withAnimation { currentStep -= 1 }
                }
            }

            Spacer()

            if currentStep < 3 {
                Button("Next") {
                    withAnimation { currentStep += 1 }
                }
                .buttonStyle(.borderedProminent)
            } else if currentStep == 3 {
                Button("Import") {
                    withAnimation { currentStep = 4 }
                }
                .buttonStyle(.borderedProminent)
            } else if currentStep == 5 {
                Button("Done") {
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
    }

    // MARK: - Import Logic

    func performImport() {
        guard let landscape else {
            importStatus = "Error: Could not load landscape data"
            return
        }

        isImporting = true
        importStatus = "Preparing import..."
        importProgress = 0.0

        Task {
            var companiesToImport: [KnownCompany] = []

            if includeMajors {
                companiesToImport += landscape.majorCompanies
            }
            if includeTopProdcos {
                companiesToImport += landscape.topProdcos
            }
            if includeAgencies {
                companiesToImport += landscape.agencies
                companiesToImport += landscape.managementCompanies
            }

            let notable = landscape.notableCompanies.filter { selectedNotable.contains($0.name) }
            companiesToImport += notable

            let total = Double(companiesToImport.count)
            var imported = 0

            // Import companies
            for knownCompany in companiesToImport {
                await importCompany(knownCompany)
                await MainActor.run {
                    importStatus = "Importing \(knownCompany.name)..."
                    imported += 1
                    importProgress = Double(imported) / total
                }

                // Small delay to show progress
                try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
            }

            // Refresh database
            await database.fetchAll()

            // Auto-arrange the map
            await MainActor.run {
                importStatus = "Arranging map..."
            }
            await database.autoLayoutObjects()

            await MainActor.run {
                importStatus = "Complete!"
                isImporting = false
                currentStep = 5
            }
        }
    }

    func importCompany(_ known: KnownCompany) async {
        // Check if company already exists
        if database.objects.contains(where: { $0.name == known.name && $0.objectClass == "company" }) {
            return // Skip duplicates
        }

        // Map type to our object_types
        let typeId = mapTypeId(known.type)

        // Build data dictionary
        var data: [String: Any] = [:]
        if let location = known.location { data["location"] = location }
        if let specialty = known.specialty { data["specialty"] = specialty }
        if let deal = known.deal { data["deal"] = deal }
        if let notes = known.notes { data["notes"] = notes }
        if let parent = known.parent { data["parent"] = parent }

        // Create company object
        do {
            let company = try await database.createObject(
                objectClass: "company",
                name: known.name,
                types: [typeId],
                data: data
            )

            // Import principals as people
            if let principals = known.principals {
                for principalName in principals {
                    // Check if person already exists
                    if database.objects.contains(where: { $0.name == principalName && $0.objectClass == "person" }) {
                        // Find existing person and create relationship
                        if let existingPerson = database.objects.first(where: { $0.name == principalName && $0.objectClass == "person" }) {
                            _ = try? await database.createRelationship(
                                sourceId: existingPerson.id,
                                targetId: company.id,
                                type: "employed_by",
                                data: ["role": "Principal"]
                            )
                        }
                        continue
                    }

                    // Create person
                    let person = try await database.createObject(
                        objectClass: "person",
                        name: principalName,
                        types: ["producer"], // Default type for principals
                        data: [:]
                    )

                    // Create employed_by relationship
                    _ = try? await database.createRelationship(
                        sourceId: person.id,
                        targetId: company.id,
                        type: "employed_by",
                        data: ["role": "Principal"]
                    )
                }
            }
        } catch {
            print("Error importing \(known.name): \(error)")
        }
    }

    func mapTypeId(_ jsonType: String) -> String {
        switch jsonType {
        case "studio": return "studio"
        case "production_company": return "production_company"
        case "financier": return "financier"
        case "agency": return "agency"
        case "management": return "management"
        case "network": return "network"
        case "streamer": return "streamer"
        case "distributor": return "distributor"
        default: return "production_company"
        }
    }
}

// MARK: - Supporting Views

struct TierToggle: View {
    let title: String
    let description: String
    let count: Int
    @Binding var isOn: Bool
    var recommended: Bool = false

    var body: some View {
        HStack {
            Toggle(isOn: $isOn) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(title)
                            .font(.headline)
                        if recommended {
                            Text("Recommended")
                                .font(.caption)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.2))
                                .cornerRadius(4)
                        }
                    }
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch)

            Spacer()

            Text("\(count)")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(8)
    }
}

struct NotableCompanyRow: View {
    let company: KnownCompany
    let isSelected: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(company.name)
                        .font(.headline)
                    Text("(\(company.displayType))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let principals = company.principals, !principals.isEmpty {
                    Text(principals.joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if let specialty = company.specialty {
                Text(specialty.prefix(2).joined(separator: ", "))
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.2))
                    .cornerRadius(4)
            }

            if let location = company.location {
                Text(location.replacingOccurrences(of: ", CA", with: "").replacingOccurrences(of: ", NY", with: ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    SetupWizardView()
}
