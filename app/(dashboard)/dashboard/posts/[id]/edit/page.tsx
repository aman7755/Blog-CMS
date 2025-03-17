"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import RichTextEditor from "reactjs-tiptap-editor";
import { extensions, injectAltText } from "@/app/extensions";
import TurndownService from "turndown";

export default function EditPostPage() {
  const router = useRouter();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [outputFormat, setOutputFormat] = useState("html");
  const [isLoading, setIsLoading] = useState(true);
  const editor = useRef(null);

  const turndownService = new TurndownService();
  
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

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const response = await fetch(`/api/posts/${id}`);
        if (!response.ok) throw new Error("Failed to fetch post");
        const post = await response.json();
        setTitle(post.title);
        setContent(post.content); // Assuming content is stored as HTML
        
        console.log("Edit page - loaded post with content:", post.content.substring(0, 200) + "...");
        console.log("Edit page - post has media:", post.media);
        
        // Log each image and its alt text from the database
        post.media.forEach((item: any, index: number) => {
          if (item.type === "image") {
            console.log(`Edit page - DB Image ${index} - url: ${item.url.substring(0, 50)}...`);
            console.log(`Edit page - DB Image ${index} - alt: "${item.alt}"`);
          }
        });
        
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load post",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchPost();
  }, [id, toast]);

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
        description: "You must be logged in to edit a post",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }

    setIsLoading(true);

    try {
      console.log("Edit page - Starting post update process");
      
      // Process content to ensure alt tags are properly set
      const processedContent = injectAltText(content);
      console.log("Edit page - Content after alt text injection:", processedContent.substring(0, 200) + "...");
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(processedContent, "text/html");
      const mediaElements = doc.querySelectorAll("img, video");
      console.log("Edit page - Found media elements:", mediaElements.length);
      
      // Debug each image's alt text in the editor
      mediaElements.forEach((el: any, index) => {
        if (el.tagName.toLowerCase() === "img") {
          console.log(`Edit page - Image ${index} - src: ${el.src.substring(0, 50)}...`);
          console.log(`Edit page - Image ${index} - alt: "${el.alt}"`);
          console.log(`Edit page - Image ${index} - outerHTML: ${el.outerHTML}`);
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
          console.log("Edit page - Processing image for update:", item);
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

      const response = await fetch(`/api/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content:
            outputFormat === "markdown"
              ? turndownService.turndown(cleanContent)
              : cleanContent,
          slug: title
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, "-")
            + "-" + Date.now().toString().slice(-6),
          excerpt: cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          authorId: (session?.user as any).id,
          media,
          cardBlocks: Array.from(cardBlocks).map((el: Element, index: number) => ({
            cardId: el.getAttribute("data-card-id"),
            position: index,
          })),
        }),
      });

      if (!response.ok) throw new Error("Failed to update post");
      toast({ title: "Success", description: "Post updated successfully" });
      router.push("/dashboard/posts");
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to update post",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || isLoading) {
    return <div>Loading...</div>;
  }

  const displayedContent =
    outputFormat === "html" ? content : turndownService.turndown(content);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Edit Post</h1>
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
              console.log("Edit page - Content updated with alt text injection");
              setContent(processedValue);
            }}
            extensions={extensions}
            dark={false}
            disabled={isLoading}
          />
        </div>

        {/* <div className="space-y-2">
          <Label>Preview</Label>
          <textarea
            style={{ height: 200, width: "100%" }}
            readOnly
            value={displayedContent}
          />
        </div> */}

        <div className="flex justify-end space-x-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
