import { Node } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import { locale } from "reactjs-tiptap-editor/locale-bundle";
import {
  Attachment,
  BaseKit,
  Blockquote,
  Bold,
  BulletList,
  Clear,
  Code,
  CodeBlock,
  Color,
  ColumnActionButton,
  Emoji,
  Excalidraw,
  ExportPdf,
  ExportWord,
  FontFamily,
  FontSize,
  FormatPainter,
  Heading,
  Highlight,
  History,
  HorizontalRule,
  Iframe,
  Image,
  ImageGif,
  ImportWord,
  Indent,
  Italic,
  Katex,
  LineHeight,
  Link,
  Mention,
  Mermaid,
  MoreMark,
  OrderedList,
  SearchAndReplace,
  SlashCommand,
  Strike,
  Table,
  TableOfContents,
  TaskList,
  TextAlign,
  TextDirection,
  Twitter,
  Underline,
  Video,
} from "reactjs-tiptap-editor/extension-bundle";
import "reactjs-tiptap-editor/style.css";
import "katex/dist/katex.min.css";

// Custom CardBlock Extension
const CardBlock = Node.create({
  name: "cardBlock",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      packageId: {
        default: null,
      },
      position: {
        default: 0,
      },
      packageData: {
        default: null,
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="card-block"]',
        getAttrs: (dom) => ({
          packageId: dom.getAttribute("data-package-id"),
          position: parseInt(dom.getAttribute("data-position") || "0", 10),
          packageData: dom.getAttribute("data-package-data") ? JSON.parse(dom.getAttribute("data-package-data")!) : null
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const packageData = node.attrs.packageData;
    if (!packageData) {
      return [
        "div",
        {
          "data-type": "card-block",
          "data-package-id": node.attrs.packageId,
          "data-position": node.attrs.position,
          class: "package-card-block",
          style: "border: 1px dashed gray; padding: 10px; text-align: center;",
        },
        `Loading package data...`,
      ];
    }

    // Create the card HTML structure
    const cardHtml = `
      <div class="package-card" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin: 10px 0;">
        <div class="package-header" style="padding: 15px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <h3 style="margin: 0; font-size: 1.25rem; color: #111827;">${packageData.name}</h3>
          ${packageData.tag ? `<span style="display: inline-block; padding: 2px 8px; background: #e5e7eb; border-radius: 4px; font-size: 0.875rem; margin-top: 5px;">${packageData.tag}</span>` : ''}
        </div>
        <div class="package-content" style="padding: 15px;">
          <div class="package-image" style="margin-bottom: 15px;">
            <img src="${packageData.banner_image || packageData.image || '/placeholder.jpg'}" 
                 alt="${packageData.name}"
                 style="width: 100%; height: 200px; object-fit: cover; border-radius: 4px;">
          </div>
          <div class="package-details" style="font-size: 0.875rem; color: #4b5563;">
            <p style="margin: 0 0 10px 0;">${atob(packageData.short_description)}</p>
            <div class="package-meta" style="display: flex; gap: 15px; margin-top: 10px;">
              ${packageData.duration ? `<span>${packageData.duration} Days</span>` : ''}
              ${packageData.starting_price ? `<span>₹${packageData.starting_price.toLocaleString()}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    return [
      "div",
      {
        "data-type": "card-block",
        "data-package-id": node.attrs.packageId,
        "data-position": node.attrs.position,
        "data-package-data": JSON.stringify(packageData),
        class: "package-card-block",
      },
      cardHtml,
    ];
  },

  addCommands() :any {
    return {
      insertPackageCard: (packageId: string) => ({ commands, editor }: { commands: any; editor: any }) => {
        // Fetch package data
        fetch(`https://staging.holidaytribe.com:3000/package/getPackageByIds/${packageId}`)
          .then(response => response.json())
          .then(data => {
            if (data.status && data.result && data.result[0]) {
              const packageData = data.result[0];
              commands.insertContent({
                type: this.name,
                attrs: {
                  packageId,
                  packageData
                }
              });
            }
          })
          .catch(error => {
            console.error('Error fetching package data:', error);
            // Insert a placeholder card with error state
            commands.insertContent({
              type: this.name,
              attrs: {
                packageId,
                packageData: null
              }
            });
          });
      },
    };
  },
});

// Custom Image Extension with Alt Text Support
const CustomImage = Image.extend({
  priority: 100, // Higher priority to ensure it runs before other extensions
  
  addAttributes() {
    // Get the parent attributes
    const parentAttributes = this.parent?.();
    
    console.log('Image extension - addAttributes called', parentAttributes);
    
    // Return merged attributes
    return {
      ...parentAttributes,
      alt: {
        default: '',
        parseHTML: (element) => {
          const alt = element.getAttribute('alt') || '';
          console.log('Image extension - parseHTML - reading alt attribute:', alt);
          return alt;
        },
        renderHTML: (attributes) => {
          console.log('Image extension - renderHTML - attributes:', attributes);
          // Always include the alt attribute even if empty to ensure it's preserved
          return { alt: attributes.alt || '' };
        },
      },
    };
  },

  // Storage for keeping track of alt text that needs to be preserved
  addStorage() {
    return {
      altTextMap: new Map(),
    };
  },
  
  // Add global styles to the document when the extension is loaded
  onBeforeCreate() {
    if (typeof document !== 'undefined') {
      // Check if the style already exists
      if (!document.getElementById('tiptap-image-edit-styles')) {
        // Create a style element
        const style = document.createElement('style');
        style.id = 'tiptap-image-edit-styles';
        style.innerHTML = `
          .ProseMirror img {
            transition: all 0.2s ease-in-out;
            cursor: pointer;
            position: relative;
          }
          
          .ProseMirror img:hover {
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
          }
          
          .ProseMirror div:has(> img) {
            position: relative;
            display: inline-block;
            margin: 2px;
          }
          
          .ProseMirror .image-alt-badge {
            position: absolute;
            top: -8px;
            right: -8px;
            background: #4b5563;
            color: white;
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 4px;
            pointer-events: none;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            font-family: system-ui, sans-serif;
            font-weight: 500;
          }
          
          .ProseMirror img[alt=""] + .image-alt-badge,
          .ProseMirror div:has(> img[alt=""]) .image-alt-badge,
          .ProseMirror .image-container:has(> img[alt=""]) .image-alt-badge,
          .image-alt-badge.no-alt {
            background: #ef4444 !important;
            font-weight: bold;
            border-radius: 50%;
            width: 10px;
            height: 10px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .ProseMirror .ProseMirror-selectednode img {
            outline: 2px solid #2563eb;
            outline-offset: 2px;
          }
          
          /* Force badge to be visible */
          .image-alt-badge {
            display: block !important;
            opacity: 1 !important;
            visibility: visible !important;
          }
        `;
        document.head.appendChild(style);
        
        // Add a global MutationObserver to automatically update badges
        const observer = new MutationObserver((mutations) => {
          mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'alt' && 
                mutation.target instanceof HTMLImageElement) {
              const img = mutation.target;
              const hasAlt = img.alt && img.alt.trim() !== '';
              
              // Find the badge and update it
              const container = img.closest('.image-container');
              if (container) {
                const badge = container.querySelector('.image-alt-badge');
                if (badge) {
                  badge.textContent = hasAlt ? 'ALT' : '';
                  (badge as HTMLElement).style.backgroundColor = hasAlt ? '#4b5563' : '#ef4444';
                  if (!hasAlt) badge.classList.add('no-alt');
                  else badge.classList.remove('no-alt');
                }
              }
            }
          });
        });
        
        // Start observing the document
        observer.observe(document.documentElement, { 
          attributes: true, 
          attributeFilter: ['alt'],
          subtree: true 
        });
      }
    }
  },

  // Force preservation of alt text on content update
  onUpdate() {
    if (typeof document !== 'undefined') {
      const altTextMap = this.storage.altTextMap;
      if (altTextMap && altTextMap.size > 0) {
        setTimeout(() => {
          try {
            const editorImgs = document.querySelectorAll('.ProseMirror img');
            editorImgs.forEach((element) => {
              const img = element as HTMLImageElement;
              if (img.src && altTextMap.has(img.src)) {
                const altText = altTextMap.get(img.src) || '';
                console.log(`Forcing alt text on update: ${img.src} -> "${altText}"`);
                
                // Update the DOM element
                img.setAttribute('alt', altText);
                
                // Update badge if it exists
                const badge = img.nextElementSibling;
                if (badge && badge.classList.contains('image-alt-badge')) {
                  badge.textContent = altText ? 'ALT' : '';
                  (badge as HTMLElement).style.backgroundColor = altText ? '#4b5563' : '#ef4444';
                }
              }
            });
          } catch (error) {
            console.error("Error updating alt text:", error);
          }
        }, 100);
      }
    }
  },

  // Force initial preservation of alt text
  onCreate() {
    console.log('Image extension onCreate - initializing alt text tracking');
    if (typeof document !== 'undefined') {
      // Initialize the alt text map with values from the content
      setTimeout(() => {
        try {
          const contentImages = document.querySelectorAll('img[alt]');
          contentImages.forEach((element) => {
            const img = element as HTMLImageElement;
            if (img.alt && img.alt.trim() !== '') {
              console.log(`Storing alt text for tracking: ${img.src} -> "${img.alt}"`);
              this.storage.altTextMap.set(img.src, img.alt);
            }
          });
        } catch (error) {
          console.error("Error storing initial alt text:", error);
        }
      }, 10);
    }
  },
  
  // Force the alt text to be applied to the node's attributes
  onTransaction({ transaction, editor }) {
    // Check if this is a docChanged transaction
    if (transaction.docChanged) {
      // Find all image nodes in the document
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image') {
          // Try to find this image in the DOM and check its alt text
          const domImg = document.querySelector(`img[src="${node.attrs.src}"]`) as HTMLImageElement;
          
          // Check if the image exists and if it has alt text from our stored map
          if (domImg && domImg.src && this.storage.altTextMap.has(domImg.src)) {
            const storedAlt = this.storage.altTextMap.get(domImg.src);
            if (storedAlt && storedAlt !== node.attrs.alt) {
              console.log('Forcing alt text from storage to ProseMirror:', storedAlt);
              editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  alt: storedAlt
                });
                return true;
              });
            }
          }
          
          // Also check if DOM has alt text that the node doesn't
          if (domImg && domImg.alt && domImg.alt !== node.attrs.alt) {
            console.log('Syncing alt text from DOM to ProseMirror:', domImg.alt);
            editor.commands.command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                alt: domImg.alt
              });
              return true;
            });
          }
        }
        return false; // Continue traversal
      });
    }
  },
  
  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      // Create the container
      const dom = document.createElement('div');
      dom.className = 'image-container';
      
      // Create the image element
      const img = document.createElement('img');
      
      // Copy all HTML attributes to the img element
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        img.setAttribute(key, value);
      });
      
      // Debug current alt text
      console.log('NodeView - image attributes:', HTMLAttributes);
      console.log('NodeView - alt text from node attrs:', node.attrs.alt);
      console.log('NodeView - alt text from HTML attributes:', HTMLAttributes.alt);
      
      // Check if we have stored alt text for this image
      if (this.storage.altTextMap && this.storage.altTextMap.has(HTMLAttributes.src)) {
        const storedAlt = this.storage.altTextMap.get(HTMLAttributes.src);
        console.log(`Found stored alt text for ${HTMLAttributes.src}: "${storedAlt}"`);
        img.setAttribute('alt', storedAlt);
      }
      // Or ensure alt is set on the img element from node attributes
      else if (node.attrs.alt && !img.getAttribute('alt')) {
        console.log('Setting missing alt attribute from node attrs:', node.attrs.alt);
        img.setAttribute('alt', node.attrs.alt);
      }
      
      // Create the badge element
      const badge = document.createElement('span');
      badge.className = 'image-alt-badge';
      
      // Determine if we have alt text
      const hasAlt = img.getAttribute('alt') && img.getAttribute('alt')!.trim() !== '';
      badge.textContent = hasAlt ? 'ALT' : '';
      badge.style.backgroundColor = hasAlt ? '#4b5563' : '#ef4444';
      if (!hasAlt) badge.classList.add('no-alt');
      
      // Force visibility
      badge.style.display = 'block';
      badge.style.visibility = 'visible';
      badge.style.opacity = '1';
      
      // The double-click handler for editing alt text
      const handleDoubleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        
        // Get the current alt text
        const currentAlt = img.getAttribute('alt') || '';
        
        // Prompt for new alt text
        const newAlt = prompt('Edit image alt text:', currentAlt);
        if (newAlt !== null) {
          try {
            const pos = getPos();
            if (typeof pos === 'number') {
              // Update the alt text in the editor's state
              editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  alt: newAlt
                });
                return true;
              });
              
              // Also update the DOM directly for immediate feedback
              img.setAttribute('alt', newAlt);
              badge.textContent = newAlt ? 'ALT' : '';
              badge.style.backgroundColor = newAlt ? '#4b5563' : '#ef4444';
              
              if (newAlt) {
                badge.classList.remove('no-alt');
              } else {
                badge.classList.add('no-alt');
              }
              
              console.log('Updated image alt text to:', newAlt);
              
              // Store the updated alt text
              this.storage.altTextMap.set(img.src, newAlt);
              
              // Dispatch a custom event to notify of the alt text change
              const event = new CustomEvent('alttextchanged', { 
                detail: { src: img.src, alt: newAlt } 
              });
              document.dispatchEvent(event);
            }
          } catch (err) {
            console.error('Error updating alt text:', err);
          }
        }
      };
      
      // Add the double-click handler to both elements
      img.addEventListener('dblclick', handleDoubleClick);
      dom.addEventListener('dblclick', handleDoubleClick);
      
      // Append elements
      dom.appendChild(img);
      dom.appendChild(badge);
      
      return {
        dom,
        contentDOM: null,
        update(updatedNode) {
          if (updatedNode.type.name !== 'image') return false;
          
          console.log('NodeView update - new alt text:', updatedNode.attrs.alt);
          
          // Update all attributes
          Object.entries(updatedNode.attrs).forEach(([key, value]) => {
            if (key === 'alt' && value) {
              console.log(`Setting alt attribute to "${value}"`);
            }
            img.setAttribute(key, value);
          });
          
          // Update the badge
          const hasAlt = updatedNode.attrs.alt && updatedNode.attrs.alt.trim() !== '';
          badge.textContent = hasAlt ? 'ALT' : '';
          badge.style.backgroundColor = hasAlt ? '#4b5563' : '#ef4444';
          
          if (hasAlt) {
            badge.classList.remove('no-alt');
          } else {
            badge.classList.add('no-alt');
          }
          
          return true;
        },
        destroy() {
          // Clean up event listeners
          img.removeEventListener('dblclick', handleDoubleClick);
          dom.removeEventListener('dblclick', handleDoubleClick);
        }
      };
    };
  },
}).configure({
  upload: async (file: File) => {
    console.log('Image extension - upload started for file:', file.name);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "image");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Image upload failed");
    const { url } = await response.json();
    console.log('Image extension - upload successful, received URL:', url);
    
    // Prompt the user for alt text
    const altText = prompt("Please enter alt text for this image:", file.name || "");
    console.log('Image extension - user entered alt text:', altText);
    
    // We will use this URL and alt text pair in the handleTransaction plugin
    window.lastUploadedImage = {
      url,
      alt: altText || ''
    };
    
    // Return just the URL as required by the Image extension
    return url;
  },
  HTMLAttributes: {
    class: 'image',
  },
});

// Helper function to inject alt text into content
export const injectAltText = (content: string): string => {
  if (!content.includes('<img') || typeof window === 'undefined') {
    return content;
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const images = doc.querySelectorAll('img');
  
  // If we have a lastUploadedImage from the window, apply its alt text
  if (window.lastUploadedImage && window.lastUploadedImage.url && images.length > 0) {
    images.forEach(img => {
      if (img.src === window.lastUploadedImage!.url && !img.alt) {
        console.log('Injecting alt text for image:', window.lastUploadedImage!.url);
        img.alt = window.lastUploadedImage!.alt;
      }
    });
    
    // Clear the last uploaded image info
    window.lastUploadedImage = null;
    
    // Return the updated HTML content
    return doc.body.innerHTML;
  }
  
  // Ensure alt attributes are preserved in the content
  let contentChanged = false;
  images.forEach(img => {
    // If the image somehow lost its alt attribute during serialization,
    // but we can find it in the DOM through its src, restore it
    if (!img.alt && img.src) {
      const domImages = document.querySelectorAll('img');
      const domImagesArray = Array.from(domImages);
      for (const domImg of domImagesArray) {
        if (domImg.src === img.src && domImg.alt) {
          img.alt = domImg.alt;
          console.log('Restored alt text for image from DOM:', img.src, 'Alt:', domImg.alt);
          contentChanged = true;
          break;
        }
      }
    }
  });
  
  // Only return the modified content if changes were made
  return contentChanged ? doc.body.innerHTML : content;
};

// Add the type definition for window.lastUploadedImage
declare global {
  interface Window {
    lastUploadedImage: { url: string; alt: string } | null;
  }
}

// Initialize the lastUploadedImage property on window
if (typeof window !== 'undefined') {
  window.lastUploadedImage = null;
}

// Export the extensions array
export const extensions = [
  BaseKit.configure({
    placeholder: {
      showOnlyCurrent: true,
    },
  }),
  History,
  SearchAndReplace,
  TableOfContents,
  FormatPainter.configure({ spacer: true }),
  Clear,
  FontFamily,
  Heading.configure({ spacer: true }),
  FontSize,
  Bold,
  Italic,
  Underline,
  Strike,
  MoreMark,
  Katex,
  Emoji,
  Color.configure({ spacer: true }),
  Highlight,
  BulletList,
  OrderedList,
  TextAlign.configure({ types: ["heading", "paragraph"], spacer: true }),
  Indent,
  LineHeight,
  TaskList.configure({
    spacer: true,
    taskItem: {
      nested: true,
    },
  }),
  Link,
  // Replace the default Image extension with our CustomImage
  CustomImage,
  Video.configure({
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "video");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Video upload failed");
      const { url } = await response.json();
      return url;
    },
  }),
  ImageGif.configure({
    GIPHY_API_KEY: process.env.NEXT_PUBLIC_GIPHY_API_KEY || "", // Add your Giphy API key in .env
  }),
  Blockquote,
  SlashCommand,
  HorizontalRule,
  Code.configure({
    toolbar: false,
  }),
  CodeBlock.configure({ defaultTheme: "dracula" }),
  ColumnActionButton,
  Table,
  Iframe,
  ExportPdf.configure({ spacer: true }),
  ImportWord.configure({
    upload: (files: File[]) => {
      const f = files.map((file) => ({
        src: URL.createObjectURL(file),
        alt: file.name,
      }));
      return Promise.resolve(f);
    },
  }),
  ExportWord,
  Excalidraw,
  TextDirection,
  Mention,
  Attachment.configure({
    upload: async (file: any) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "attachment");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Attachment upload failed");
      const { url } = await response.json();
      return url;
    },
  }),
  Mermaid.configure({
    upload: async (file: any) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "mermaid");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Mermaid upload failed");
      const { url } = await response.json();
      return url;
    },
  }),
  Twitter,
  CardBlock, // Add the custom CardBlock extension
];