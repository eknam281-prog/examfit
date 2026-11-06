import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-semibold">페이지를 찾을 수 없습니다.</p>
      <div className="mt-4">
        <LinkButton href="/" primary>
          홈으로
        </LinkButton>
      </div>
    </div>
  );
}
