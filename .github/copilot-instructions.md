<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Email Manager App - Copilot Instructions

This is an Email Manager application built with Node.js, Express, and Gmail API for Gmail integration.

## Project Overview
- **Tech Stack**: Node.js, Express.js, EJS, SQLite, Gmail API
- **Purpose**: Manage emails from Office 365 with automatic checking, sending, and attachment management
- **Database**: SQLite with tables for emails and attachments
- **Authentication**: Gmail API OAuth2 Flow

## Key Features
1. Automatic email checking every 2 hours
2. Email sending with file attachments
3. File attachment management with date-based folder structure (YYYY/MM/DD)
4. Email viewing interface
5. Database storage for email metadata and attachments

## Code Patterns & Conventions
- Use async/await for asynchronous operations
- Follow Express.js route structure in `/routes` directory
- Services are in `/services` directory for business logic
- Views use EJS templating engine
- Database operations use SQLite with callbacks and promises
- File handling uses fs-extra for better async support

## Microsoft Graph API Integration
- Client ID: [YOUR_CLIENT_ID]
- Tenant ID: [YOUR_TENANT_ID]
- Email: [YOUR_EMAIL@yourdomain.com]
- Uses Client Credentials Flow for server-to-server authentication

## Database Schema
- **emails table**: Stores email metadata 
- **attachments table**: Stores file attachment metadata with paths

## When implementing new features:
1. Follow the existing service pattern
2. Use proper error handling with try-catch blocks
3. Maintain consistent logging
4. Follow the established routing patterns
5. Use Bootstrap 5 for UI components
6. Ensure mobile responsiveness
