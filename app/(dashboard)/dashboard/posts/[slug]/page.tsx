import PostRenderer from '@/components/PostRenderer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function PostPage({ params }) {
  const { slug } = params;

  const post = await prisma.post.findUnique({
    where: { slug },
    include: {
      media: true,
      cardBlocks: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!post) {
    return <div>Post not found</div>;
  }

  return <PostRenderer post={post} />;
}