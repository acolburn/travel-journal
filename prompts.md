# Database

I want to create a notes app in React JS to use as a travel journal. Notes will be saved in a Firestore database. Each note will represent a day in a trip, with fields for heading (string), text (string), createdAt (date), and author ("husband" or "wife"). At the end of the trip, heading and text entries will be added to generate a single downloaded document, preferably in a format readable by Word, like html (saved with a .doc suffix). Individual trips should generate separate documents.

The app will have only two users (husband, wife).

Suggest the database structure I should use when creating the Firestore database.

# App

You will act as an expert frontend engineer to create a notes app in React JS with Tailwind CSS, linked to a Firestore realtime database, to use as a travel journal. The interface will be similar to that of Simplenote or NotesNook. Create a 3-column responsive layout suitable for mobile, tablet, or desktop, using Tailwind CSS flexbox/grid with Segoe UI typography:

    - Left Sidebar (Narrow): List of Trips with an 'Add Trip' button.
    
    - Middle Sidebar (Narrow): List of Notes (Days) belonging to the active trip, sorted chronologically, with an 'Add Day' button. Users can only add a note to an active trip.
    
    - Right Main Pane (Wide): The active note's editor interface. The heading should be an input field for the date string, and the body should be a auto-resizing textarea. Long entries should include vertical scrollbars. Users will type raw markdown syntax; they do not need a preview mode.

The app should display a loading spinner while authenticating and a loading indicator while fetching notes. Deleting trips or notes should include confirmation dialogs.

The app should autosave after 500-1000ms of inactivity.

Have a single root collection in the database (`trips`). Each trip will have a subcollection for notes (`notes`). Each note will represent a day in the trip. The note heading will be a date (`displayDate`). If it makes simpler code, dates may be stored as timestamps while displayed as strings. Each note will also have a text field for the day's journal entry (`entryText`). Trip and note id's can be auto-generated. Both users should be able to view and edit everything from all trips.

At the end of a trip, heading and text entries will be added to generate a single downloaded document. When the user clicks 'Download Trip Archive', the app must query all notes within that trip, sort them by date, compile them sequentially with the trip title as an <h1> (or #), the date strings as <h2> (or ##), and the text entries as standard paragraphs, then trigger a browser download for a single .doc or .docx file for the trip. Users should be able to include headings, bold, italic, numbered lists, and bulleted lists. User can use markdown format in notes. `html-docx-js` or simply exporting an HTML string with a MIME type of application/msword are possibilities; other simple options are also acceptable.

The app will have only two users. Implement a simple Firebase Authentication flow (Email/Password).

If wifi is unavailable, users should still be able to write journal entries, which will be saved and automatically added later. Consider using `enableIndexedDbPersistence(db)` right after initializing Firebase.

It's OK to use external packages. I have npm installed firebase and tailwindcss. The code must be easy to understand. I have an advanced beginner level understanding of HTML, CSS, JavaScript, and React. I understand useEffect, useState, and useRef hooks; I can learn others. All code should be well enough commented as to be understandable by someone unfamiliar with the project. Comment every function, explain every useEffect, avoid custom hooks if possible, avoid clever JavaScript, prefer readability over brevity.

Build this project in small milestones. After completing each milestone, stop and wait for approval before continuing. Each milestone must leave the application in a working state.
