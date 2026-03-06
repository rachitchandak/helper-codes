/**
 * Accessibility Knowledge Base
 *
 * Contains the comprehensive WCAG rules knowledge base and the system prompt
 * used by the accessibility audit agent. This includes Level A, Level AA,
 * and detailed checking rules sourced from the WCAG specification.
 */

// ---------------------------------------------------------------------------
// Full WCAG Knowledge Base
// ---------------------------------------------------------------------------

export const WCAG_KNOWLEDGE_BASE = `# WCAG Rules Knowledge Base
Level A Must Fix

1.1.1 Non-text Content: Images, SVG, icons, canvas, input type="image" require alt, aria-label, or accessible name. Decorative images use alt=""
1.2.1 Audio-only Video-only: Provide transcript or equivalent alternative
1.2.2 Captions Prerecorded: Provide captions for prerecorded video
1.2.3 Audio Description or Media Alternative: Provide audio description or full text alternative
1.3.1 Info and Relationships: Use semantic HTML headings lists tables th scope fieldset legend landmarks label
1.3.2 Meaningful Sequence: DOM order matches visual order
1.3.3 Sensory Characteristics: Instructions not based only on color shape size position
1.3.4 Orientation: Support portrait and landscape unless essential
1.3.5 Identify Input Purpose: Use correct autocomplete attributes
1.4.1 Use of Color: Color not sole method to convey meaning
1.4.2 Audio Control: Auto playing audio longer than 3 seconds must have pause stop or volume control
2.1.1 Keyboard: All functionality operable via keyboard
2.1.2 No Keyboard Trap: Focus can move away using keyboard
2.1.4 Character Key Shortcuts: Single key shortcuts can be disabled remapped or active on focus only
2.2.1 Timing Adjustable: Time limits adjustable extendable or disableable
2.2.2 Pause Stop Hide: Moving blinking scrolling content can be paused stopped or hidden
2.3.1 Three Flashes: No content flashes more than 3 times per second
2.4.1 Bypass Blocks: Provide skip link to main content
2.4.2 Page Titled: Descriptive page title element
2.4.3 Focus Order: Logical tab order following visual flow
2.4.4 Link Purpose: Link text or accessible name describes destination
2.5.1 Pointer Gestures: Complex gestures have simple alternative
2.5.2 Pointer Cancellation: Actions triggered on up event and cancellable
2.5.3 Label in Name: Accessible name contains visible label text
2.5.4 Motion Actuation: Motion triggered features have alternative controls
3.1.1 Language of Page: HTML element has valid lang attribute
3.2.1 On Focus: Focus does not trigger unexpected context change
3.2.2 On Input: Input does not trigger unexpected major context change
3.3.1 Error Identification: Errors identified in text
3.3.2 Labels or Instructions: Inputs have associated label or aria-label
4.1.2 Name Role Value: Custom components expose accessible name role and state via ARIA

Level AA Should Fix

1.2.4 Captions Live: Provide captions for live video
1.2.5 Audio Description Prerecorded: Provide audio description for prerecorded video
1.4.3 Contrast Minimum: Text contrast at least 4.5 to 1 or 3 to 1 for large text
1.4.4 Resize Text: Text resizable to 200 percent without loss of content or function
1.4.5 Images of Text: Use real text instead of images unless essential
1.4.10 Reflow: No horizontal scroll at 320px width except essential
1.4.11 Non-text Contrast: UI components and focus indicators have at least 3 to 1 contrast
1.4.12 Text Spacing: Increased line height letter spacing word spacing does not break content
1.4.13 Content on Hover Focus: Hover or focus content dismissible hoverable persistent
2.4.5 Multiple Ways: More than one way to locate a page
2.4.6 Headings and Labels: Headings and labels are descriptive
2.4.7 Focus Visible: Keyboard focus indicator visible
2.4.11 Focus Not Obscured: Focused elements not hidden behind overlays
2.5.7 Dragging Movements: Drag interactions have non drag alternative
2.5.8 Target Size Minimum: Interactive targets at least 24 by 24 CSS pixels
3.1.2 Language of Parts: Language changes marked with lang attribute
3.2.3 Consistent Navigation: Navigation order consistent across pages
3.2.4 Consistent Identification: Components identified consistently
3.2.6 Consistent Help: Help mechanism appears in same location
3.3.3 Error Suggestion: Error messages suggest correction
3.3.4 Error Prevention: Confirmation for legal financial or important submissions
3.3.7 Redundant Entry: Do not require re entering previously provided information
3.3.8 Accessible Authentication: No cognitive function test unless alternative provided
4.1.3 Status Messages: Dynamic updates announced using aria-live or role status

Rules for checking:
- **Autocomplete attribute has valid value** (1.3.5 Identify Input Purpose (Level AA)): This rule checks that the HTML autocomplete attribute has a correct value.
- **Button has non-empty accessible name** (4.1.2 Name, Role, Value (Level A)): This rule checks that each button element has a non-empty accessible name.
- **Element in sequential focus order has visible focus** (2.4.7 Focus Visible (Level AA)): This rule checks that each element in sequential focus order has some visible focus indication.
- **Element marked as decorative is not exposed** (Not required for conformance): This rule checks that elements marked as decorative either are not included in the accessibility tree, or have a presentational role.
- **Element with aria-hidden has no content in sequential focus navigation** (4.1.2 Name, Role, Value (Level A)): This rule checks that elements with an aria-hidden attribute do not contain elements that are part of the sequential focus navigation and focusable.
- **Element with lang attribute has valid language tag** (3.1.2 Language of Parts (Level AA)): This rule checks that a non-empty lang attribute of an element in the page has a language tag with a known primary language subtag.
- **Element with presentational children has no focusable content** (4.1.2 Name, Role, Value (Level A)): This rule checks that elements with a role that makes its children presentational do not contain focusable elements.
- **Element with role attribute has required states and properties** (ARIA 1.2, 5.2.2 Required States and Properties): This rule checks that elements that have an explicit role also specify all required states and properties.
- **Form field has non-empty accessible name** (4.1.2 Name, Role, Value (Level A)): This rule checks that each form field element has a non-empty accessible name.
- **Headers attribute specified on a cell refers to cells in the same table element** (1.3.1 Info and Relationships (Level A)): This rule checks that the headers attribute on a cell refer to other cells in the same table element.
- **HTML images contain no text** (1.4.5 Images of Text (Level AA)): This rule checks that images of text are not used
- **HTML page has lang attribute** (3.1.1 Language of Page (Level A)): This rule checks that an HTML page has a non-empty lang attribute.
- **HTML page has non-empty title** (2.4.2 Page Titled (Level A)): This rule checks that a non-embedded HTML page has a non-empty title.
- **HTML page lang attribute has valid language tag** (3.1.1 Language of Page (Level A)): This rule checks that the lang attribute of the root element of a non-embedded HTML page has a language tag with a known primary language subtag.
- **HTML page title is descriptive** (2.4.2 Page Titled (Level A)): This rule checks that the first title in an HTML web page describes the topic or purpose of that page.
- **Iframe with interactive elements is not excluded from tab-order** (2.1.1 Keyboard (Level A)): This rule checks that iframe elements which contain an interactive (tabbable) element are not excluded from sequential focus navigation.
- **Image accessible name is descriptive** (1.1.1 Non-text Content (Level A)): This rule checks that the accessible names of images serve an equivalent purpose to the image.
- **Image button has non-empty accessible name** (1.1.1 Non-text Content (Level A)): This rule checks that each image button element has a non-empty accessible name.
- **Image has non-empty accessible name** (1.1.1 Non-text Content (Level A)): This rule checks that each image either has a non-empty accessible name or is marked up as decorative.
- **Important letter spacing in style attributes is wide enough** (1.4.12 Text Spacing (Level AA)): This rule checks that the style attribute is not used to prevent adjusting letter-spacing by using !important, except if it's at least 0.12 times the font size.
- **Important line height in style attributes is wide enough** (1.4.12 Text Spacing (Level AA)): This rule checks that the style attribute is not used to prevent adjusting line-height by using !important, except if it's at least 1.5 times the font size.
- **Important word spacing in style attributes is wide enough** (1.4.12 Text Spacing (Level AA)): This rule checks that the style attribute is not used to prevent adjusting word-spacing by using !important, except if it's at least 0.16 times the font size.
- **Link has non-empty accessible name** (4.1.2 Name, Role, Value (Level A)): This rule checks that each link has a non-empty accessible name.
- **Menuitem has non-empty accessible name** (4.1.2 Name, Role, Value (Level A)): This rule checks that each element with a menuitem role has a non-empty accessible name.
- **Meta element has no refresh delay** (2.2.1 Timing Adjustable (Level A)): This rule checks that the meta element is not used for delayed redirecting or refreshing.
- **ARIA required context role** (1.3.1 Info and Relationships (Level A)): This rule checks that an element with an explicit semantic role exists inside its required context.
- **Iframe element has non-empty accessible name** (4.1.2 Name, Role, Value (Level A)): This rule checks that each iframe element has a non-empty accessible name.
- **Scrollable content can be reached with sequential focus navigation** (2.1.1 Keyboard (Level A)): This rule checks that scrollable elements or their descendants can be reached with sequential focus navigation so that they can be scrolled by keyboard
- **Video element content is media alternative for text** (Not required for conformance): This rule checks non-streaming video is a media alternative for text on the page.
- **Meta viewport allows for zoom** (1.4.4 Resize text (Level AA)): This rule checks that the meta element retains the user agent ability to zoom.
- **Text has minimum contrast** (1.4.3 Contrast (Minimum) (Level AA)): This rule checks that the highest possible contrast of every text character with its background meets the minimal contrast requirement.
- **Video element auditory content has captions** (Not required for conformance): This rule checks that captions are available for audio information in non-streaming video elements.
- **Audio or video element that plays automatically has a control mechanism** (Not required for conformance): audio or video that plays automatically must have a control mechanism.
- **Zoomed text node is not clipped with CSS overflow** (1.4.4 Resize text (Level AA)): This rule checks that text nodes are not unintentionally clipped by overflow, when a page is zoomed to 200% on 1280 by 1024 viewport.
- **HTML page lang and xml:lang attributes have matching values** (3.1.1 Language of Page (Level A)): This rule checks that both lang and xml:lang attributes on the root element of a non-embedded HTML page, have the same primary language subtag.
- **SVG element with explicit role has non-empty accessible name** (1.1.1 Non-text Content (Level A)): This rule checks that each SVG image element that is explicitly included in the accessibility tree has a non-empty accessible name.
- **Audio or video element avoids automatically playing audio** (Not required for conformance): This rule checks that audio or video that plays automatically does not have audio that lasts for more than 3 seconds or has an audio control mechanism to stop or mute it.
- **Audio element content has text alternative** (1.2.1 Audio-only and Video-only (Prerecorded) (Level A)): This rule checks that audio elements have a text alternative available.
- **Audio element content is media alternative for text** (Not required for conformance): This rule checks that the audio element is a media alternative for text on the page.
- **Iframe elements with identical accessible names have equivalent purpose** (4.1.2 Name, Role, Value (Level A)): This rule checks that iframe elements with identical accessible names embed the same resource or equivalent resources.
- **Audio element content has transcript** (Not required for conformance): This rule checks that audio elements have a text transcript that includes all auditory information.
- **Video element visual-only content is media alternative for text** (Not required for conformance): This rule checks non-streaming silent video is a media alternative for text on the page.
- **ARIA attribute is defined in WAI-ARIA** (1.3.1 Info and Relationships (Level A), 4.1.2 Name, Role, Value (Level A) (Secondary)): This rule checks that each aria- attribute specified is defined in ARIA 1.2.
- **ARIA state or property is permitted** (ARIA 1.2, 8.6 State and Property Attribute Processing): This rule checks that WAI-ARIA states or properties are allowed for the element they are specified on.
- **ARIA state or property has valid value** (Not required for conformance): This rule checks that each ARIA state or property has a valid value type.
- **Link in context is descriptive** (2.4.4 Link Purpose (In Context) (Level A)): This rule checks that the accessible name of a link together with its context describes its purpose.
- **Attribute is not duplicated** (4.1.1 Parsing (Level A)): This rule checks that HTML and SVG starting tags do not contain duplicated attributes.
- **Error message describes invalid form field value** (3.3.1 Error Identification (Level A)): This rule checks that text error messages provided when the user completes a form field with invalid values or using an invalid format, identify the cause of the error or how to fix the error.
- **Orientation of the page is not restricted using CSS transforms** (1.3.4 Orientation (Level AA)): This rule checks that page content is not restricted to either landscape or portrait orientation using CSS transforms.
`;

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

/**
 * Returns the full system prompt for the accessibility‑audit agent,
 * embedding the complete WCAG knowledge base.
 */
export function getAccessibilityPrompt(): string {
  return `You are an expert **Accessibility Tester & Auditor** with deep knowledge of:
- WCAG 2.1 / 2.2 (Levels A, AA, AAA)
- WAI-ARIA 1.2 specification
- Section 508 compliance
- Best practices for inclusive web and application development

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR MISSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Read the provided source code file carefully.
2. Identify every accessibility violation or potential issue using the WCAG Knowledge Base below.
3. For **each** issue, determine:
   • Which WCAG criterion it violates (e.g. 1.1.1, 2.4.7, 4.1.2).
   • The severity: critical | major | minor | info.
   • The approximate line number where the issue occurs (if identifiable).
   • The offending element or code snippet.
   • A clear description of *why* it is an issue.
   • A concrete recommendation for fixing it.
   • The relevant WCAG success criterion reference.
4. If the file has no accessibility issues, return an empty issues array.
5. Provide a brief overall summary of the file's accessibility posture.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WCAG RULES KNOWLEDGE BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${WCAG_KNOWLEDGE_BASE}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT GUIDELINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Be thorough: check every element, style, script, and ARIA usage against ALL rules above.
- Check all Level A rules (Must Fix) first, then Level AA rules (Should Fix), then the detailed checking rules.
- Be precise: cite exact line numbers and elements wherever possible.
- Be actionable: every recommendation should be immediately implementable.
- Do NOT fabricate issues that don't exist in the code.
- You may identify issues beyond the listed rules if they impact accessibility;
  use "CUSTOM" as the rule ID for those.
- First use the readFile tool to read the file contents, then analyze them.`;
}
