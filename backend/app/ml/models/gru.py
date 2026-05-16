try:
    import torch
    import torch.nn as nn
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    torch = None  # type: ignore
    nn = None     # type: ignore


class StockGRU:
    """
    Lighter GRU with residual connections for faster inference.
    Requires torch. If torch is not installed, instantiation raises ImportError.
    """
    def __new__(cls, *args, **kwargs):
        if not _TORCH_AVAILABLE:
            raise ImportError("PyTorch is not installed. StockGRU requires torch.")
        return _StockGRUImpl(*args, **kwargs)


if _TORCH_AVAILABLE:
    class _StockGRUImpl(nn.Module):
        def __init__(self, input_size=47, hidden_size1=128, hidden_size2=64, num_classes=3):
            super().__init__()
            self.gru1 = nn.GRU(input_size, hidden_size1, batch_first=True, bidirectional=True, dropout=0.15, num_layers=1)
            self.gru2 = nn.GRU(hidden_size1 * 2, hidden_size2, batch_first=True, bidirectional=True, dropout=0.15, num_layers=1)
            self.input_proj = nn.Linear(input_size, hidden_size2 * 2)
            self.fc = nn.Linear(hidden_size2 * 2, 64)
            self.gelu = nn.GELU()
            self.dropout = nn.Dropout(0.25)
            self.out = nn.Linear(64, num_classes)

        def forward(self, x):
            residual = self.input_proj(x)
            residual_pool = residual.mean(dim=1)
            out, _ = self.gru1(x)
            out, _ = self.gru2(out)
            pool = out.mean(dim=1)
            x = pool + residual_pool
            x = self.fc(x)
            x = self.gelu(x)
            x = self.dropout(x)
            logits = self.out(x)
            return logits
else:
    class _StockGRUImpl:  # type: ignore
        pass
