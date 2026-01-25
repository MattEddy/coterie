import SwiftUI
import Contacts

struct ContactPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var contactsService = ContactsService.shared
    @ObservedObject private var database = LocalDatabase.shared

    @State private var selectedContacts: Set<String> = []  // Contact IDs
    @State private var searchText = ""
    @State private var isImporting = false
    @State private var importedCount = 0
    @State private var showingResults = false

    var body: some View {
        VStack(spacing: 0) {
            header

            Divider()

            switch contactsService.authorizationStatus {
            case .authorized:
                contactsList
            case .notDetermined:
                requestAccessView
            case .denied, .restricted:
                deniedAccessView
            @unknown default:
                deniedAccessView
            }
        }
        .frame(minWidth: 500, minHeight: 600)
        .task {
            await loadContactsIfAuthorized()
        }
        .alert("Import Complete", isPresented: $showingResults) {
            Button("Done") { dismiss() }
        } message: {
            Text("Imported \(importedCount) contacts and their companies.")
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Import from Contacts")
                    .font(.title2)
                    .fontWeight(.semibold)

                Spacer()

                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }

            if contactsService.authorizationStatus == .authorized {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Search contacts...", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(8)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(8)

                HStack {
                    Text("\(selectedContacts.count) selected")
                        .foregroundColor(.secondary)

                    Spacer()

                    Button("Select Matching") {
                        preselectMatchingContacts()
                    }
                    .disabled(contactsService.contacts.isEmpty)

                    Button("Clear All") {
                        selectedContacts.removeAll()
                    }
                    .disabled(selectedContacts.isEmpty)
                }
                .font(.caption)
            }
        }
        .padding()
    }

    private var contactsList: some View {
        VStack {
            if contactsService.isLoading {
                Spacer()
                ProgressView("Loading contacts...")
                Spacer()
            } else if filteredContacts.isEmpty {
                Spacer()
                Text("No contacts found")
                    .foregroundColor(.secondary)
                Spacer()
            } else {
                List {
                    ForEach(groupedContacts.keys.sorted(), id: \.self) { organization in
                        Section(header: organizationHeader(organization)) {
                            ForEach(groupedContacts[organization] ?? []) { contact in
                                ContactRow(
                                    contact: contact,
                                    isSelected: selectedContacts.contains(contact.id),
                                    isMatching: isMatchingContact(contact)
                                ) {
                                    toggleSelection(contact)
                                }
                            }
                        }
                    }
                }
                .listStyle(.inset)
            }

            Divider()

            HStack {
                if let error = contactsService.lastError {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                }

                Spacer()

                Button("Import Selected") {
                    Task {
                        await importSelectedContacts()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedContacts.isEmpty || isImporting)
            }
            .padding()
        }
    }

    private var requestAccessView: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Contacts Access Required")
                .font(.headline)

            Text("Coterie can import contacts from companies in your network.")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Allow Access") {
                Task {
                    if await contactsService.requestAccess() {
                        await contactsService.fetchContacts()
                        preselectMatchingContacts()
                    }
                }
            }
            .buttonStyle(.borderedProminent)

            Spacer()
        }
        .padding()
    }

    private var deniedAccessView: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "person.crop.circle.badge.xmark")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Contacts Access Denied")
                .font(.headline)

            Text("To import contacts, enable access in System Settings > Privacy & Security > Contacts.")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Open System Settings") {
                if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts") {
                    NSWorkspace.shared.open(url)
                }
            }

            Spacer()
        }
        .padding()
    }

    private func organizationHeader(_ organization: String) -> some View {
        HStack {
            Text(organization)
                .font(.headline)

            if let matchedName = matchedCompanyName(for: organization) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                    .font(.caption)

                // Show matched name if different from org name
                if matchedName.lowercased() != organization.lowercased() {
                    Text("→ \(matchedName)")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            }

            Spacer()

            Button(action: { toggleOrganization(organization) }) {
                Text(isOrganizationFullySelected(organization) ? "Deselect All" : "Select All")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .foregroundColor(.accentColor)
        }
    }

    // MARK: - Computed Properties

    private var filteredContacts: [ContactEntry] {
        if searchText.isEmpty {
            return contactsService.contacts
        }

        let search = searchText.lowercased()
        return contactsService.contacts.filter { contact in
            contact.fullName.lowercased().contains(search) ||
            contact.organizationName.lowercased().contains(search) ||
            contact.jobTitle.lowercased().contains(search)
        }
    }

    private var groupedContacts: [String: [ContactEntry]] {
        var grouped: [String: [ContactEntry]] = [:]

        for contact in filteredContacts {
            let org = contact.organizationName.isEmpty ? "No Company" : contact.organizationName
            grouped[org, default: []].append(contact)
        }

        return grouped
    }

    private var knownCompanyNames: Set<String> {
        Set(database.objects.filter { $0.objectClass == "company" }.map { $0.name })
    }

    /// Cache of contact org -> matched company name for performance
    @State private var matchedCompanies: [String: String] = [:]

    // MARK: - Helper Methods

    private func loadContactsIfAuthorized() async {
        contactsService.updateAuthorizationStatus()
        if contactsService.authorizationStatus == .authorized {
            await contactsService.fetchContacts()
            buildMatchCache()
            preselectMatchingContacts()
        }
    }

    /// Pre-compute fuzzy matches for all contact organizations
    private func buildMatchCache() {
        let companies = knownCompanyNames
        var cache: [String: String] = [:]

        for contact in contactsService.contacts {
            let org = contact.organizationName
            if org.isEmpty { continue }
            if cache[org] != nil { continue }  // Already processed

            if let (matchedName, _) = FuzzyMatcher.bestMatch(for: org, in: companies, threshold: 0.75) {
                cache[org] = matchedName
            }
        }

        matchedCompanies = cache
    }

    private func isKnownCompany(_ name: String) -> Bool {
        if matchedCompanies[name] != nil { return true }
        // Fallback to direct fuzzy check
        return FuzzyMatcher.bestMatch(for: name, in: knownCompanyNames, threshold: 0.75) != nil
    }

    private func matchedCompanyName(for orgName: String) -> String? {
        matchedCompanies[orgName]
    }

    private func isMatchingContact(_ contact: ContactEntry) -> Bool {
        guard !contact.organizationName.isEmpty else { return false }
        return isKnownCompany(contact.organizationName)
    }

    private func preselectMatchingContacts() {
        for contact in contactsService.contacts {
            if isMatchingContact(contact) {
                selectedContacts.insert(contact.id)
            }
        }
    }

    private func toggleSelection(_ contact: ContactEntry) {
        if selectedContacts.contains(contact.id) {
            selectedContacts.remove(contact.id)
        } else {
            selectedContacts.insert(contact.id)
        }
    }

    private func isOrganizationFullySelected(_ organization: String) -> Bool {
        guard let contacts = groupedContacts[organization] else { return false }
        return contacts.allSatisfy { selectedContacts.contains($0.id) }
    }

    private func toggleOrganization(_ organization: String) {
        guard let contacts = groupedContacts[organization] else { return }

        if isOrganizationFullySelected(organization) {
            for contact in contacts {
                selectedContacts.remove(contact.id)
            }
        } else {
            for contact in contacts {
                selectedContacts.insert(contact.id)
            }
        }
    }

    // MARK: - Import Logic

    private func importSelectedContacts() async {
        isImporting = true
        var imported = 0

        let contactsToImport = contactsService.contacts.filter { selectedContacts.contains($0.id) }

        // Group by organization to batch company creation
        var companiesByName: [String: GraphObject] = [:]

        // First, cache existing companies
        for company in database.objects.filter({ $0.objectClass == "company" }) {
            companiesByName[company.name.lowercased()] = company
        }

        for contact in contactsToImport {
            do {
                // Create or find company if contact has one
                var companyId: UUID?

                if !contact.organizationName.isEmpty {
                    let orgLower = contact.organizationName.lowercased()

                    // First check for exact match
                    if let existingCompany = companiesByName[orgLower] {
                        companyId = existingCompany.id
                    }
                    // Then check for fuzzy match to existing database company
                    else if let matchedName = matchedCompanyName(for: contact.organizationName),
                            let matchedCompany = database.objects.first(where: { $0.name == matchedName && $0.objectClass == "company" }) {
                        companyId = matchedCompany.id
                        // Cache for future contacts with same org
                        companiesByName[orgLower] = matchedCompany
                    }
                    // Finally, create new company if no match
                    else {
                        let newCompany = try await database.createObject(
                            objectClass: "company",
                            name: contact.organizationName,
                            types: ["production_company"],  // Default type
                            data: ["source": "contacts"]
                        )
                        companiesByName[orgLower] = newCompany
                        companyId = newCompany.id
                    }
                }

                // Create person
                var personData: [String: Any] = ["source": "contacts"]
                if !contact.jobTitle.isEmpty {
                    personData["title"] = contact.jobTitle
                }
                if !contact.emailAddresses.isEmpty {
                    personData["email"] = contact.emailAddresses.first!
                }
                if !contact.phoneNumbers.isEmpty {
                    personData["phone"] = contact.phoneNumbers.first!
                }

                let person = try await database.createObject(
                    objectClass: "person",
                    name: contact.fullName,
                    types: ["executive"],  // Default type
                    data: personData
                )

                // Create relationship if we have a company
                if let companyId = companyId {
                    _ = try await database.createRelationship(
                        sourceId: person.id,
                        targetId: companyId,
                        type: "employed_by"
                    )
                }

                imported += 1
            } catch {
                print("Failed to import contact \(contact.fullName): \(error)")
            }
        }

        // Run auto-layout for the new objects
        await database.autoLayoutObjects()

        isImporting = false
        importedCount = imported
        showingResults = true
    }
}

// MARK: - Contact Row

struct ContactRow: View {
    let contact: ContactEntry
    let isSelected: Bool
    let isMatching: Bool
    let onToggle: () -> Void

    var body: some View {
        HStack {
            Button(action: onToggle) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? .accentColor : .secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(contact.fullName)
                        .fontWeight(isMatching ? .medium : .regular)

                    if isMatching {
                        Text("Match")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.2))
                            .foregroundColor(.green)
                            .cornerRadius(4)
                    }
                }

                if !contact.jobTitle.isEmpty {
                    Text(contact.jobTitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggle)
    }
}

#Preview {
    ContactPickerView()
}
