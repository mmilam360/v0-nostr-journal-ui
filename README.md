# Nostr Journal

A decentralized, encrypted journaling application built on the Nostr protocol. Your private thoughts, encrypted and secure, accessible from anywhere without relying on centralized servers.

## Overview

Nostr Journal is a privacy-focused journaling application that leverages the Nostr protocol for decentralized data storage, log in methods, and Event Kind 30001. Your journal entries are encrypted locally using your cryptographic keys before being stored on Nostr relays, ensuring complete privacy and data ownership.

### Key Features

- **Decentralized Storage**: Notes stored on Nostr relays, not centralized servers
- **End-to-End Encryption**: All content encrypted with your cryptographic keys
- **Cross-Device Sync**: Access your journal from any device using the same keys
- **Multiple Authentication Methods**: Browser extension, private key import, or remote signer
- **Publish to Nostr**: Share selected notes or highlights as public Kind 1 posts to Nostr feeds
- **Lightning Integration**: Support development through Lightning payments
- **Offline-First**: Works offline with sync when connection is available
- **Open Source**: Fully transparent codebase for community review

## Technology Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Accessible UI components
- **Lucide React**: Icon library

### Nostr Integration
- **nostr-tools**: Core Nostr protocol implementation
- **nostr-signer-connector**: NIP-46 remote signing support
- **qrcode.react**: QR code generation for mobile connections

### Authentication & Security
- **NIP-07**: Browser extension integration
- **NIP-46**: Remote signer protocol for mobile apps
- **NIP-04**: End-to-end encryption for private content
- **Web Crypto API**: Local encryption/decryption

## Architecture

### Core Components

#### Authentication Layer
- `components/login-page-horizontal.tsx`: Main login interface
- `lib/signer-connector.ts`: Centralized signer management
- `lib/signer-manager.ts`: Event signing coordination
- `lib/remote-signer-manager.ts`: NIP-46 remote signer handling

#### Data Management
- `lib/kind30001-journal.ts`: Journal entry storage using Kind 30001 events
- `lib/nostr-storage.ts`: Nostr relay interaction
- `lib/nostr-crypto.ts`: Encryption/decryption utilities
- `lib/keystore.ts`: Local key management

#### User Interface
- `components/main-app.tsx`: Main application interface
- `components/editor.tsx`: Rich text editor for notes
- `components/note-list.tsx`: Note browsing and management
- `components/tags-panel.tsx`: Tag-based organization

### Data Flow

1. **Authentication**: User authenticates via browser extension, private key, or remote signer
2. **Key Management**: Cryptographic keys are managed securely (never stored in plain text)
3. **Content Creation**: Notes are written locally and encrypted using user's keys
4. **Publishing**: Encrypted content is published to Nostr relays as Kind 30001 events
5. **Synchronization**: Notes sync across devices by querying relays with user's pubkey
6. **Decryption**: Content is decrypted locally when displayed

### Event Structure

Journal entries are stored as Nostr Kind 30001 (parameterized replaceable events) with the following structure:

```json
{
  "kind": 30001,
  "created_at": 1640995200,
  "tags": [
    ["d", "journal-{unique-id}"],
    ["p", "{user-pubkey}"]
  ],
  "content": "{encrypted-journal-data}",
  "pubkey": "{user-pubkey}"
}
```

The encrypted content contains:
```json
{
  "id": "unique-note-id",
  "title": "Note Title",
  "content": "Note content",
  "tags": ["tag1", "tag2"],
  "createdAt": "2023-01-01T00:00:00.000Z",
  "lastModified": "2023-01-01T00:00:00.000Z"
}
```

## Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- A Nostr browser extension (recommended: Alby, nos2x, or similar)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/mmilam360/v0-nostr-journal-ui.git
   cd v0-nostr-journal-ui
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `.next/` directory.

## Usage

### Getting Started

1. **Choose Authentication Method**:
   - **Browser Extension**: Install a Nostr browser extension (Alby, nos2x)
   - **Private Key**: Import an existing private key (nsec format)
   - **Remote Signer**: Use a mobile Nostr app like nsec.app

2. **Create Your First Note**: Click "New Note" to start writing

3. **Organize with Tags**: Add tags to categorize your entries

4. **Sync Across Devices**: Log in with the same keys on any device to access your notes

5. **Publish to Nostr**: Select text in any note and click "Publish Highlight" to share it as a public Kind 1 post to Nostr feeds

### Authentication Methods

#### Browser Extension (Recommended)
- Install a Nostr browser extension
- Click "Login with Browser Extension"
- Approve the connection in your extension

#### Private Key Import
- Export your private key from another Nostr client
- Click "Login with Private Key"
- Paste your nsec private key
- Set a password to encrypt the key locally

#### Remote Signer (Mobile)
- Use a mobile Nostr app like nsec.app
- Click "Remote Signer"
- Scan QR code with your mobile app
- Approve the connection

## Development

### Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── main-app.tsx      # Main application
│   ├── login-page-horizontal.tsx  # Authentication
│   ├── editor.tsx        # Note editor
│   ├── note-list.tsx     # Note management
│   └── ...               # Other components
├── lib/                  # Utility functions
│   ├── kind30001-journal.ts    # Journal storage
│   ├── signer-connector.ts     # Signer management
│   ├── nostr-storage.ts        # Relay interaction
│   └── ...               # Other utilities
└── hooks/                # Custom React hooks
    ├── useDebounce.ts    # Debounced state
    └── useNostrPublish.ts # Nostr publishing
```

### Key Libraries and Dependencies

- **nostr-tools**: Nostr protocol implementation
- **nostr-signer-connector**: NIP-46 remote signing
- **qrcode.react**: QR code generation
- **@noble/hashes**: Cryptographic utilities
- **@noble/secp256k1**: Elliptic curve cryptography

### Adding New Features

1. **New Components**: Add to `components/` directory
2. **Nostr Integration**: Extend `lib/nostr-*.ts` files
3. **UI Components**: Use shadcn/ui components from `components/ui/`
4. **Styling**: Use Tailwind CSS classes

### Testing

```bash
npm run test
```

### Code Style

- Use TypeScript for all new code
- Follow React hooks patterns
- Use shadcn/ui components for UI consistency
- Implement proper loading states and error handling
- Document custom event schemas

## Nostr Protocol Integration

This project implements several Nostr NIPs (Nostr Implementation Possibilities):

- **NIP-01**: Basic protocol flow
- **NIP-04**: Encryption/decryption
- **NIP-07**: Browser extension signing
- **NIP-46**: Remote signing protocol
- **NIP-51**: Generic lists (Kind 30001)

### Event Kinds Used

- **Kind 30001**: Journal entries (parameterized replaceable events)
- **Kind 1**: Public posts (when publishing notes or highlights to Nostr feeds)
- **Kind 5**: Deletion events (NIP-09)

### Relay Configuration

The app uses a curated list of reliable Nostr relays:
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`
- `wss://purplepag.es`
- `wss://relay.snort.social`
- `wss://relay.primal.net`

## Security Considerations

### Data Privacy
- All journal content is encrypted locally before transmission
- Private keys are never transmitted to servers
- Users maintain complete control over their data

### Authentication Security
- Browser extension method uses secure WebCrypto API
- Private key import encrypts keys locally with user password
- Remote signer uses NIP-46 for secure mobile authentication

### Best Practices
- Always verify the integrity of downloaded code
- Use reputable Nostr browser extensions
- Keep private keys secure and backed up
- Regularly update the application

## Contributing

We welcome contributions from the open source community. Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature-name`
3. **Make your changes**
4. **Run tests**: `npm run test`
5. **Submit a pull request**

### Contribution Guidelines

- Follow existing code style and patterns
- Add tests for new features
- Update documentation as needed
- Ensure all Nostr protocol implementations follow NIP specifications
- Test with multiple authentication methods

## Support

### Getting Help
- Check the [Issues](https://github.com/mmilam360/v0-nostr-journal-ui/issues) page
- Join the Nostr community discussions
- Review Nostr documentation at [nostr.com](https://nostr.com)

### Reporting Issues
- Use the GitHub Issues tracker
- Include steps to reproduce the problem
- Specify your browser, extension, and authentication method

## License

This project is open source. Please check the LICENSE file for details.

## Acknowledgments

- Built on the [Nostr protocol](https://github.com/nostr-protocol/nostr)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Community feedback and contributions

## Roadmap

- [ ] Mobile app development
- [ ] Advanced search and filtering
- [ ] Image and file attachments
- [ ] Collaborative journaling
- [ ] Calendar view
- [ ] Export/import functionality
- [ ] Plugin system for extensions

---

For more information about the Nostr protocol, visit [nostr.com](https://nostr.com). Learn more about Lightning payments at [lightning.network](https://lightning.network).
