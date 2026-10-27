import { useRef } from "react";
import { PixelRatio, type StyleProp, type ViewStyle } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { setViewSize } from "../three/gl";

/** GLView que informa ao renderer o tamanho real a cada mudança de layout (giro de tela incluso). */
export function GameGL({ onContextCreate, style }: { onContextCreate: (gl: ExpoWebGLRenderingContext) => void; style?: StyleProp<ViewStyle> }) {
  const gl = useRef<ExpoWebGLRenderingContext | null>(null);
  const size = useRef<{ w: number; h: number } | null>(null);
  const apply = () => {
    if (gl.current && size.current) setViewSize(gl.current, size.current.w, size.current.h);
  };
  return (
    <GLView
      style={style}
      onLayout={(e) => {
        const r = PixelRatio.get();
        size.current = { w: e.nativeEvent.layout.width * r, h: e.nativeEvent.layout.height * r };
        apply();
      }}
      onContextCreate={(ctx) => {
        gl.current = ctx;
        apply();
        onContextCreate(ctx);
      }}
    />
  );
}
