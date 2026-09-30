import { reactive, ref } from "vue";
export const merchantName = ref("百果集");
export const toast = reactive({
  message: "",
  kind: "success" as "success" | "error",
});
let timer: ReturnType<typeof setTimeout>;
export function notify(message: string, kind: "success" | "error" = "success") {
  clearTimeout(timer);
  Object.assign(toast, { message, kind });
  timer = setTimeout(() => {
    toast.message = "";
  }, 6000);
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试";
