# Loom Clone

A simplified Loom-style screen recording application built with Angular. This demo application allows users to select a folder for saving recordings and provides an intuitive interface for managing recording destinations.

## Features

- **Folder Selection**: Choose a destination folder for recordings using the File System Access API
- **Persistent Storage**: Selected folder is stored in IndexedDB and remembered between sessions
- **Permission Management**: Auto-checks and requests folder permissions as needed
- **Browser Compatibility**: Detects unsupported browsers and displays helpful warnings
- **Modern Angular**: Built with Angular 19+ using standalone components and signals

## Browser Requirements

This application requires the **File System Access API**, which is currently only supported in:

- ✅ Google Chrome (86+)
- ✅ Microsoft Edge (86+)
- ✅ Opera (72+)

**Not supported:**

- ❌ Firefox
- ❌ Safari
- ❌ Other browsers

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Angular CLI (v19 or higher)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd loom-clone/loom-clone-frontend
```

2. Install dependencies:

```bash
npm install
```

## Development

Run the development server:

```bash
npm start
```

Or using Angular CLI:

```bash
ng serve
```

Navigate to `http://localhost:4200/` in a supported browser (Chrome, Edge, or Opera).

The application will automatically reload if you change any of the source files.

## Linting & Formatting

Run ESLint:

```bash
npm run lint
```

Run ESLint with auto-fixes:

```bash
npm run lint:fix
```

Format all files with Prettier:

```bash
npm run format
```

Check formatting without writing changes:

```bash
npm run format:check
```

## Build

Build the project for production:

```bash
npm run build
```

Or using Angular CLI:

```bash
ng build
```

The build artifacts will be stored in the `dist/` directory.

## Manual QA Checklist (macOS Default Devices)

Use this checklist when testing on macOS in a Chromium browser where camera or microphone `deviceId` may be empty before permissions are granted.

- [ ] Open the app and select a recording folder.
- [ ] In **Recording Devices**, select the available camera and microphone.
- [ ] Refresh the page and confirm both selections are restored.
- [ ] Click **Grant Camera & Microphone Access** and allow permission.
- [ ] Confirm no error appears about invalid or missing device IDs.
- [ ] Start recording, then stop recording.
- [ ] Verify the recording is saved to the selected folder.

## Project Structure

```
src/app/
├── home/                          # Home page component
│   ├── home.component.ts          # Component logic
│   ├── home.component.html        # Component template
│   └── home.component.css         # Component styles
├── services/
│   └── storage/
│       ├── browser-compat.service.ts    # Browser compatibility detection
│       ├── folder-storage.service.ts    # Folder selection and persistence
│       └── indexeddb.service.ts         # IndexedDB wrapper
├── models/
│   └── storage.models.ts          # TypeScript interfaces and types
├── app.component.ts               # Root component
└── app.routes.ts                  # Application routing
```

## Key Technologies

- **Angular 19**: Modern web framework with standalone components
- **Signals**: Reactive state management
- **File System Access API**: Browser API for folder selection and file operations
- **IndexedDB**: Browser storage for persisting folder handles
- **TypeScript**: Type-safe development

## How It Works

1. **Folder Selection**: User selects a folder using the browser's native directory picker
2. **Permission Handling**: Application requests and manages read/write permissions
3. **Persistence**: Folder handle is stored in IndexedDB for future sessions
4. **Auto-Recovery**: On app load, checks if stored folder is still valid and accessible
5. **Invalid Folders**: Automatically clears invalid folders (deleted or moved)

## Accessibility

This application follows WCAG AA standards:

- ✅ Proper ARIA attributes and roles
- ✅ Keyboard navigation support
- ✅ Focus management
- ✅ Color contrast requirements
- ✅ Screen reader compatibility
- ✅ Reduced motion support

## Future Features

- Screen recording capability
- Camera recording
- Microphone audio capture
- Recording playback
- Multiple recording management
- Export options

## Development Notes

This is a **demo application for learning purposes**. It demonstrates:

- Angular best practices with signals and standalone components
- Modern browser APIs (File System Access API)
- Persistent storage with IndexedDB
- Responsive and accessible UI design
- TypeScript type safety

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
