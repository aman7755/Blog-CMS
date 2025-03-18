"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import nextDynamic from "next/dynamic";
import TurndownService from "turndown";
import { injectAltText } from "@/app/extensions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import React from "react";

// Define the props type for RichTextEditor (adjust based on library docs)
interface RichTextEditorProps {
  editorRef?: React.RefObject<any>;
  output?: "html" | "markdown";
  content: string;
  onChangeContent: (value: string) => void;
  extensions: any[];
  dark?: boolean;
  disabled?: boolean;
}

// Dynamically import RichTextEditor with SSR disabled
const RichTextEditor = nextDynamic(
  () =>
    import("reactjs-tiptap-editor").then((mod) => {
      const Component = mod.default;
      return {
        // eslint-disable-next-line react/display-name
        default: React.forwardRef<any, RichTextEditorProps>((props, ref) => {
          // Ensure output is one of the required values
          const safeProps = {
            ...props,
            output:
              props.output === "markdown" ? "html" : props.output || "html",
          };
          return <Component {...safeProps} ref={ref} />;
        }),
      };
    }),
  { ssr: false }
);

export default function NewPostPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [featureImage, setFeatureImage] = useState("");
  const [featureImageAlt, setFeatureImageAlt] = useState("");
  const [outputFormat, setOutputFormat] = useState<"html" | "markdown">("html");
  const [isLoading, setIsLoading] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([]);
  const editor = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turndownService = new TurndownService();

  useEffect(() => {
    import("@/app/extensions").then((mod) => {
      setExtensions(mod.extensions);
    });
  }, []);

  turndownService.addRule("images", {
    filter: "img",
    replacement: (content: string, node: any) => {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src");
      return `![${alt}](${src})`;
    },
  });

  turndownService.addRule("cardBlock", {
    filter: (node: any) =>
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "card-block",
    replacement: (_content: any, node: any) => {
      const cardId = node.getAttribute("data-card-id");
      return `[Card Block ID: ${cardId}]`;
    },
  });

  const insertCardBlock = () => {
    if (typeof window !== "undefined" && editor.current) {
      const cardId = prompt("Enter Card ID:");
      if (cardId) {
        editor.current.commands.insertCardBlock({ cardId, position: 0 });
      }
    }
  };

  const handleFeatureImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageUploadButton = document.getElementById(
        "featureImageUploadBtn"
      );
      if (imageUploadButton) {
        imageUploadButton.textContent = "Uploading...";
        imageUploadButton.setAttribute("disabled", "true");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "image");

      console.log("Uploading feature image:", file.name);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Feature image upload failed");
      const { url } = await response.json();

      console.log("Feature image uploaded successfully to:", url);
      setFeatureImage(url);
      if (!featureImageAlt) {
        setFeatureImageAlt(file.name.split(".")[0] || "");
      }

      toast({
        title: "Success",
        description: "Feature image uploaded successfully",
      });
    } catch (error: unknown) {
      console.error("Feature image upload error:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to upload feature image",
        variant: "destructive",
      });
    } finally {
      const imageUploadButton = document.getElementById(
        "featureImageUploadBtn"
      );
      if (imageUploadButton) {
        imageUploadButton.textContent = "Upload Image";
        imageUploadButton.removeAttribute("disabled");
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    if (!(session?.user as any)?.id) {
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
      const slug =
        title
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, "-") +
        "-" +
        Date.now().toString().slice(-6);

      console.log("New post - Sending SEO data:", {
        metaTitle,
        metaDescription,
        featureImage: featureImage
          ? featureImage.substring(0, 50) + "..."
          : null,
        featureImageAlt,
      });

      const processedContent = injectAltText(content);
      console.log("Content after alt text injection:", processedContent);

      const parser = new DOMParser();
      console.log("Content being parsed:", processedContent);
      const doc = parser.parseFromString(processedContent, "text/html");
      const mediaElements = doc.querySelectorAll("img, video");
      console.log("Found media elements:", mediaElements.length);

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
          alt: el.tagName.toLowerCase() === "img" ? el.alt || "" : "",
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

      console.log(
        "Final content to be saved:",
        outputFormat === "markdown"
          ? turndownService.turndown(cleanContent).substring(0, 200) + "..."
          : cleanContent.substring(0, 200) + "..."
      );

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          metaTitle: metaTitle || title,
          metaDescription:
            metaDescription ||
            cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          featureImage,
          featureImageAlt,
          content:
            outputFormat === "markdown"
              ? turndownService.turndown(cleanContent)
              : cleanContent,
          slug,
          excerpt: cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          authorId: (session?.user as any)?.id,
          media,
          cardBlocks: Array.from(cardBlocks).map(
            (el: Element, index: number) => ({
              cardId: el.getAttribute("data-card-id"),
              position: index,
            })
          ),
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

        <Card>
          <CardHeader>
            <CardTitle>SEO Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="metaTitle">Meta Title (for SEO)</Label>
              <Input
                id="metaTitle"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Enter meta title (defaults to post title if empty)"
              />
              <p className="text-xs text-muted-foreground">
                {metaTitle.length} / 60 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaDescription">
                Meta Description (for SEO)
              </Label>
              <Textarea
                id="metaDescription"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Enter meta description"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {metaDescription.length} / 160 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="featureImage">Feature Image</Label>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  id="featureImageUploadBtn"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                >
                  Upload Image
                </Button>
                <input
                  type="file"
                  id="featureImage"
                  ref={fileInputRef}
                  onChange={handleFeatureImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                {featureImage && (
                  <span className="text-sm text-muted-foreground">
                    Image uploaded
                  </span>
                )}
              </div>

              {featureImage && (
                <div className="mt-4 space-y-4">
                  <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border">
                    <Image
                      src={featureImage}
                      alt={featureImageAlt}
                      className="object-cover"
                      fill
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="featureImageAlt">Image Alt Text</Label>
                    <Input
                      id="featureImageAlt"
                      value={featureImageAlt}
                      onChange={(e) => setFeatureImageAlt(e.target.value)}
                      placeholder="Describe the image for accessibility"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
          <p className="text-sm text-muted-foreground mb-2">
            <strong>Tip:</strong> Double-click on images to edit alt text
          </p>
          <RichTextEditor
            editorRef={editor}
            output="html"
            content={content}
            onChangeContent={(value: string) => {
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

// Force dynamic rendering to prevent prerendering
export const dynamic = "force-dynamic";
