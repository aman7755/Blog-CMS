import { Node } from "@tiptap/core";
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
      cardId: {
        default: null,
      },
      position: {
        default: 0, // We'll set this dynamically when saving
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="card-block"]',
        getAttrs: (dom) => ({
          cardId: dom.getAttribute("data-card-id"),
          position: parseInt(dom.getAttribute("data-position") || "0", 10),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "card-block",
        "data-card-id": node.attrs.cardId,
        "data-position": node.attrs.position,
        style: "border: 1px dashed gray; padding: 10px; text-align: center;",
      },
      `Card Block (ID: ${node.attrs.cardId})`,
    ];
  },

  addCommands(): any {
    return {
      insertCardBlock:
        (attrs: any) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});

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
  Image.configure({
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "image");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Image upload failed");
      const { url } = await response.json();
      return url;
    },
  }),
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
