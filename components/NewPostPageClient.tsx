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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";
import React from "react";

interface RichTextEditorProps {
  editorRef?: React.RefObject<any>;
  output?: "html" | "markdown";
  content: string;
  onChangeContent: (value: string) => void;
  extensions: any[];
  dark?: boolean;
  disabled?: boolean;
}

const RichTextEditor = nextDynamic(
  () =>
    import("reactjs-tiptap-editor").then((mod) => {
      const Component = mod.default;
      return {
        // eslint-disable-next-line react/display-name
        default: React.forwardRef<any, RichTextEditorProps>((props, ref) => {
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
  const { data: session, status: sessionStatus } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [featureImage, setFeatureImage] = useState("");
  const [featureImageAlt, setFeatureImageAlt] = useState("");
  const [outputFormat, setOutputFormat] = useState<"html" | "markdown">("html");
  const [isLoading, setIsLoading] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [postStatus, setPostStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(
    "DRAFT"
  );
  const editor = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [packageInput, setPackageInput] = useState("");
  const [packages, setPackages] = useState<any[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [manualId, setManualId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [relatedBlogIds, setRelatedBlogIds] = useState<string[]>([]);
  const [selectedBlogId, setSelectedBlogId] = useState("");
  const [availableBlogs, setAvailableBlogs] = useState<any[]>([]);
  const [isLoadingBlogs, setIsLoadingBlogs] = useState(false);
  const turndownService = new TurndownService();

  useEffect(() => {
    import("@/app/extensions").then((mod) => {
      setExtensions(mod.extensions);
    });
    
    // Fetch available blogs when component mounts
    fetchBlogs();
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

  const fetchPackage = async (packageId: string) => {
    try {
      setIsLoadingPackages(true);
      const response = await fetch(
        `https://staging.holidaytribe.com:3000/package/getPackageByIds/${packageId}`
      );
      if (!response.ok) throw new Error("Failed to fetch package");

      const data = await response.json();
      if (data.status && data.result && data.result[0]) {
        console.log("Package fetched successfully:", data.result[0]);
        // Add to packages list if not already present
        setPackages((prev) => {
          if (prev.some((p) => p.id === data.result[0].id)) {
            return prev;
          }
          return [...prev, data.result[0]];
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error fetching package:", error);
      toast({
        title: "Error",
        description: "Failed to fetch package data",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoadingPackages(false);
    }
  };

  const addPackage = async () => {
    if (!packageInput.trim()) return;

    // Check if already added
    if (packageIds.includes(packageInput)) {
      toast({
        title: "Already added",
        description: "This package ID is already in the list",
      });
      return;
    }

    const success = await fetchPackage(packageInput);
    if (success) {
      setPackageIds((prev) => [...prev, packageInput]);
      setPackageInput("");
    }
  };

  const removePackage = async (packageId: string) => {
    setPackageIds((prev) => prev.filter((id) => id !== packageId));
    setPackages((prev) => prev.filter((p) => p.id !== packageId));
  };

  const insertPackagesIntoContent = () => {
    if (!editor.current || packages.length === 0) return;

    // Create HTML for all packages in a horizontal scrollable container
    const packagesHtml = `
      <div style="overflow-x: auto; white-space: nowrap; margin: 20px 0; padding: 10px 0; width: 100%; -webkit-overflow-scrolling: touch;">
        <div style="display: inline-flex; gap: 16px; padding: 0 4px;">
          ${packages
            .map(
              (pkg) => `
            <div style="display: inline-block; vertical-align: top; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); width: 280px; background: white;">
              <div style="height: 180px; overflow: hidden; position: relative; background-color: #f3f4f6;">
                <img src="/images/package.svg" alt="${
                  pkg.name
                }" style="width: 100%; height: 100%; object-fit: cover; display: block;">
              </div>
              <div style="padding: 16px 20px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.3; white-space: normal;">
                  ${pkg.name}
                </h3>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; white-space: normal;">
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">Resorts</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">•</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">Clubs</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">•</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">Beach</span>
                </div>
                <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; white-space: normal;">
                  Weekend getaway
                </div>
                <div style="font-weight: 600; font-size: 14px; color: #111827; white-space: normal;">
                  From ₹${
                    pkg.starting_price
                      ? pkg.starting_price.toLocaleString()
                      : "29,000"
                  }
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    // Insert the content at cursor position
    editor.current.commands.insertContent(packagesHtml);

    toast({
      title: "Success",
      description: "Packages inserted into content",
    });
  };

  const fetchBlogs = async () => {
    try {
      setIsLoadingBlogs(true);
      const response = await fetch("/api/posts");
      if (!response.ok) throw new Error("Failed to fetch blogs");

      const data = await response.json();
      console.log("Fetched blogs:", data);
      
      if (data && Array.isArray(data.posts)) {
        setAvailableBlogs(data.posts);
      } else if (data && Array.isArray(data)) {
        setAvailableBlogs(data);
      } else {
        console.error("Unexpected API response format:", data);
        toast({
          title: "Error",
          description: "Unexpected API response format",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching blogs:", error);
      toast({
        title: "Error",
        description: "Failed to fetch available blogs",
        variant: "destructive",
      });
    } finally {
      setIsLoadingBlogs(false);
    }
  };

  const addRelatedBlog = () => {
    if (!selectedBlogId) return;
    
    // Check if already added
    if (relatedBlogIds.includes(selectedBlogId)) {
      toast({
        title: "Already added",
        description: "This blog is already in the related blogs list",
      });
      return;
    }

    setRelatedBlogIds((prev) => [...prev, selectedBlogId]);
    setSelectedBlogId("");
  };

  const removeRelatedBlog = (blogId: string) => {
    setRelatedBlogIds((prev) => prev.filter((id) => id !== blogId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sessionStatus === "loading") return;
    if (!session?.user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a post",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }

    if (!manualId) {
      toast({
        title: "Error",
        description: "Please enter a custom ID",
        variant: "destructive",
      });
      return;
    }

    if (!title) {
      toast({
        title: "Error",
        description: "Please enter a title",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Process content to ensure alt tags are properly set
      const processedContent = injectAltText(content);

      // Extract images from content
      const parser = new DOMParser();
      const doc = parser.parseFromString(processedContent, "text/html");
      const images = doc.querySelectorAll("img");

      const mediaItems = Array.from(images).map((img) => {
        return {
          url: img.src,
          type: "image",
          alt: img.alt || "",
        };
      });

      // Find all card blocks in the content
      const cardBlocks = Array.from(
        doc.querySelectorAll('div[data-type="card-block"]')
      ).map((block) => {
        const cardId = block.getAttribute("data-card-id") || "";
        const position = block.getAttribute("data-position") || "0";
        return {
          cardId,
          position: parseInt(position),
        };
      });

      // Generate a slug from the title
      const slug = title
        .toLowerCase()
        .replace(/[^\w\s]/gi, "")
        .replace(/\s+/g, "-");

      // Ensure authors can only create draft posts
      let finalStatus = postStatus;
      if (session.user.role === "author") {
        finalStatus = "DRAFT";
      }

      // Handle markdown conversion if needed
      let finalContent = processedContent;
      if (outputFormat === "markdown") {
        finalContent = turndownService.turndown(processedContent);
      }

      // Create the post via API
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content: finalContent,
          slug,
          excerpt: metaDescription || finalContent.substring(0, 157) + "...",
          authorId: session.user.id,
          metaTitle: metaTitle || title,
          metaDescription,
          featureImage,
          featureImageAlt,
          media: mediaItems,
          cardBlocks,
          packageIds,
          manualId, // Send manual ID to be used as primary key
          status: finalStatus,
          customTitle,
          keywords,
          relatedBlogIds, // Add the related blog IDs to the request
        }),
      });

      // Read the response first - but don't await it twice
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
        throw new Error("Failed to parse server response");
      }
      
      if (!response.ok) {
        // Extract meaningful error message from various formats
        let errorMessage = "Failed to create post";
        let errorDetail = "";
        console.error("API Error Response:", data);
        
        if (data) {
          if (typeof data.error === 'string') {
            // If it's a simple string error
            errorMessage = data.error;
          }
          
          // Check for the structured errorDetail from our updated API
          if (data.errorDetail) {
            const detail = data.errorDetail;
            
            if (detail.type === 'unique_constraint') {
              errorMessage = detail.message || `A post with this ${detail.field} already exists`;
              errorDetail = `Please use a different ${detail.field}`;
            } else if (detail.type === 'foreign_key_constraint') {
              errorMessage = "Reference error";
              errorDetail = detail.message || "One of the references in your post doesn't exist";
            }
          } else if (data.error && typeof data.error !== 'string') {
            // Fallback for other error formats
            const errorStr = JSON.stringify(data.error);
            if (errorStr.includes("Unique constraint failed")) {
              const match = errorStr.match(/Unique constraint failed on the fields: \(\`([^`]+)`\)/);
              if (match && match[1]) {
                errorMessage = `A post with this ${match[1]} already exists`;
                errorDetail = "Please use a different " + match[1];
              } else {
                errorMessage = "A post with these details already exists";
                errorDetail = "Please check for duplicate content";
              }
            } else if (errorStr.includes("Foreign key constraint failed")) {
              errorMessage = "Reference error";
              errorDetail = "One of the references in your post points to an item that doesn't exist";
            } else {
              // Use the error object as a string
              errorMessage = "Creation failed";
              errorDetail = errorStr.substring(0, 100); // Limit length for toast
            }
          }
        }
        
        console.log('SHOWING ERROR TOAST:', {errorMessage, errorDetail});
        toast({
          title: "Error",
          description: errorDetail ? `${errorMessage}: ${errorDetail}` : errorMessage,
          variant: "destructive",
        });
        console.log('TOAST WAS CALLED');
        
        // Store that we showed the toast to prevent duplicates
        window._toastShown = true;
        
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Post created successfully",
      });

      // Redirect to posts list
      router.push("/dashboard/posts");
    } catch (error) {
      console.error("Error creating post:", error);
      
      // Don't show another toast if we already showed one for the API error
      if (!(typeof window !== 'undefined' && (window as any)._toastShown)) {
        console.log('SHOWING CATCH ERROR TOAST');
        toast({
          title: "Error",
          description: (error as Error).message || "Failed to create post",
          variant: "destructive",
        });
        console.log('CATCH TOAST WAS CALLED');
      } else {
        console.log('SUPPRESSING DUPLICATE TOAST');
      }
    } finally {
      if (typeof window !== 'undefined') {
        // Reset the flag
        (window as any)._toastShown = false;
      }
      setIsLoading(false);
    }
  };

  if (sessionStatus === "loading") {
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
        <Card className="my-4 border shadow-sm">
          <CardHeader>
            <CardTitle>Post ID</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manualId">Custom ID</Label>
              <Input
                id="manualId"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Enter a custom ID"
                required
              />
              <p className="text-xs text-gray-500">
                This ID will be used as the primary identifier for the post and cannot be changed later
              </p>
            </div>
          </CardContent>
        </Card>

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

        <Card className="my-4 border shadow-sm">
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
              <p className="text-xs text-gray-500">
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
              <p className="text-xs text-gray-500">
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
                  <span className="text-sm text-gray-500">Image uploaded</span>
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

        <Card className="my-4 border shadow-sm">
          <CardHeader>
            <CardTitle>Holiday Packages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter package ID"
                value={packageInput}
                onChange={(e) => setPackageInput(e.target.value)}
              />
              <Button
                type="button"
                onClick={addPackage}
                disabled={isLoadingPackages}
              >
                {isLoadingPackages ? "Loading..." : "Add Package"}
              </Button>
            </div>

            {packageIds.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mt-4">
                  {packageIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full"
                    >
                      <span>{id}</span>
                      <button
                        type="button"
                        onClick={() => removePackage(id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <span className="sr-only">Remove</span>×
                      </button>
                    </div>
                  ))}
                </div>

                {packages.length > 0 && (
                  <>
                    <div className="mt-6 overflow-x-auto pb-4">
                      <div className="flex gap-4">
                        {packages.map((pkg) => (
                          <div
                            key={pkg.id}
                            className="flex-none w-[280px] rounded-xl overflow-hidden shadow-md bg-white"
                          >
                            <div className="h-[180px] bg-gray-100 relative">
                              <img
                                src="/images/package.svg"
                                alt={pkg.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="p-4">
                              <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                                {pkg.name}
                              </h3>
                              <div className="flex flex-wrap gap-1 text-xs text-gray-500 mb-2">
                                <span>Resorts</span>
                                <span>•</span>
                                <span>Clubs</span>
                                <span>•</span>
                                <span>Beach</span>
                              </div>
                              <div className="text-sm text-gray-500 mb-3">
                                Weekend getaway
                              </div>
                              <div className="font-semibold">
                                From ₹
                                {pkg.starting_price
                                  ? pkg.starting_price.toLocaleString()
                                  : "29,000"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="my-4 border shadow-sm">
          <CardHeader>
            <CardTitle>Additional Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customTitle">Display Title</Label>
              <Input
                id="customTitle"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Enter a display title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Enter keywords separated by commas"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="my-4 border shadow-sm">
          <CardHeader>
            <CardTitle>Most Read Blogs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select
                value={selectedBlogId}
                onValueChange={setSelectedBlogId}
                disabled={isLoadingBlogs}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a blog to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableBlogs.length > 0 ? (
                    availableBlogs.map((blog) => (
                      <SelectItem key={blog.id} value={blog.id || ""}>
                        {blog.id || "No ID"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-blogs" disabled>
                      No blogs available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={addRelatedBlog}
                disabled={isLoadingBlogs || !selectedBlogId}
              >
                Add Blog
              </Button>
            </div>

            {relatedBlogIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {relatedBlogIds.map((id) => {
                  const blog = availableBlogs.find((b) => b.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full"
                    >
                      <span>{id}</span>
                      <button
                        type="button"
                        onClick={() => removeRelatedBlog(id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <span className="sr-only">Remove</span>×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            
            <p className="text-xs text-gray-500">
              Add other blog posts that are relevant or most read in relation to this post
            </p>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label>Content</Label>
          <div className="flex gap-4 mb-4">
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

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={postStatus}
            onValueChange={(value) =>
              setPostStatus(value as "DRAFT" | "PUBLISHED" | "ARCHIVED")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">DRAFT</SelectItem>
              <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
              <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
            </SelectContent>
          </Select>
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
