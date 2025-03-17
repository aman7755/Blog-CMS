"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import TurndownService from "turndown";
import { injectAltText } from "@/app/extensions";

// Dynamically import RichTextEditor
const RichTextEditor = dynamic(() => import("reactjs-tiptap-editor"), {
  ssr: false,
});

export default function NewPostPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [outputFormat, setOutputFormat] = useState("html");
  const [isLoading, setIsLoading] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([]); // Store extensions client-side
  const editor = useRef(null);
  const turndownService = new TurndownService();

  // Load extensions only on the client
  useEffect(() => {
    import("@/app/extensions").then((mod) => {
      setExtensions(mod.extensions);
    });
  }, []);

  // Custom rule for images to preserve alt text
  turndownService.addRule('images', {
    filter: 'img',
    replacement: function (content: string, node: any) {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src');
      return `![${alt}](${src})`;
    }
  });

  turndownService.addRule("cardBlock", {
    filter: (node: any) =>
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "card-block",
    replacement: (content: any, node: any) => {
      const cardId = node.getAttribute("data-card-id");
      return `[Card Block ID: ${cardId}]`;
    },
  });

  const insertCardBlock = () => {
    const cardId = prompt("Enter Card ID:");
    if (cardId && editor.current) {
      (editor.current as any).commands.insertCardBlock({ cardId, position: 0 });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    if (!(session?.user as any).id) {
      toast({
        title: "Error",
        description: "You must be logged in to create a post",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }

    setIsLoading(true);
    try {
      console.log("Starting post creation process");
      const slug = title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, "-") 
        + "-" + Date.now().toString().slice(-6);
      
      // Process content to ensure alt tags are properly set
      const processedContent = injectAltText(content);
      console.log("Content after alt text injection:", processedContent);
      
      // Parse the content and extract media elements
      const parser = new DOMParser();
      
      console.log("Content being parsed:", processedContent);
      const doc = parser.parseFromString(processedContent, "text/html");
      const mediaElements = doc.querySelectorAll("img, video");
      console.log("Found media elements:", mediaElements.length);
      
      // Debug each image's alt text
      mediaElements.forEach((el: any, index) => {
        if (el.tagName.toLowerCase() === "img") {
          console.log(`Image ${index} - src: ${el.src.substring(0, 50)}...`);
          console.log(`Image ${index} - alt: "${el.alt}"`);
          console.log(`Image ${index} - outerHTML: ${el.outerHTML}`);
        }
      });
      
      const cardBlocks = doc.querySelectorAll('div[data-type="card-block"]');

      const media = Array.from(mediaElements).map((el: any) => {
        const item = {
          url: el.src,
          type: el.tagName.toLowerCase() === "img" ? "image" : "video",
          alt: el.tagName.toLowerCase() === "img" ? (el.alt || "") : "",
        };
        
        if (el.tagName.toLowerCase() === "img") {
          console.log("Processing image for database save:", item);
        }
        
        return item;
      });

      let cleanContent = processedContent;
      cardBlocks.forEach((el) => {
        cleanContent = cleanContent.replace(
          el.outerHTML,
          `[Card Block ID: ${el.getAttribute("data-card-id")}]`
        );
      });

      console.log("Final content to be saved:", outputFormat === "markdown" 
        ? turndownService.turndown(cleanContent).substring(0, 200) + "..." 
        : cleanContent.substring(0, 200) + "...");
      
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content:
            outputFormat === "markdown"
              ? turndownService.turndown(cleanContent)
              : cleanContent,
          slug,
          excerpt: cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          authorId: (session?.user as any).id,
          media,
          cardBlocks: Array.from(cardBlocks).map((el: Element, index: number) => ({
            cardId: el.getAttribute("data-card-id"),
            position: index,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create post");
      }

      toast({
        title: "Success",
        description: "Post created successfully",
      });
      router.push("/dashboard/posts");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create post",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  // Show a loading state until extensions are loaded
  if (extensions.length === 0) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">New Post</h1>
        <Button onClick={() => router.push("/dashboard/posts")}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter post title"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
          <div className="flex gap-4 mb-4">
            <Button type="button" onClick={insertCardBlock}>
              Insert Card Block
            </Button>
            <Button
              type="button"
              onClick={() => setOutputFormat("html")}
              variant={outputFormat === "html" ? "default" : "outline"}
            >
              HTML
            </Button>
            <Button
              type="button"
              onClick={() => setOutputFormat("markdown")}
              variant={outputFormat === "markdown" ? "default" : "outline"}
            >
              Markdown
            </Button>
          </div>
          <RichTextEditor
            ref={editor}
            output="html"
            content={content}
            onChangeContent={(value) => {
              // Process value to ensure alt tags are applied
              const processedValue = injectAltText(value);
              console.log("Content updated with alt text injection");
              setContent(processedValue);
            }}
            extensions={extensions} 
            dark={false}
            disabled={isLoading}
          />
        </div>

        <div className="flex justify-end space-x-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
