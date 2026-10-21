# Midpoint Iteration, Affine-Regular Polygons, and Rank-3 Coplanarity

## 1. Setup

Let $X \in \mathbb{R}^{n\times 3}$ hold $n$ points $x_0,\dots,x_{n-1}\in\mathbb{R}^3$, read as a **closed polygon** in cyclic order. Indices are taken mod $n$. Let $S$ be the cyclic shift $(SX)_j = x_{j+1}$, and $\mathbf 1\in\mathbb{R}^n$ the all-ones vector.

- **Midpoint step.** $M = \tfrac12(I+S)$ maps each vertex to the midpoint of its outgoing edge.
- **Double step, recentred.** $M^2$ advances labels by one; undoing that shift gives the symmetric circulant
$$A = \tfrac14\,(S^{-1} + 2I + S),\qquad (AX)_j = \tfrac14 x_{j-1} + \tfrac12 x_j + \tfrac14 x_{j+1}.$$

The construction depends on the chosen cyclic order: permuting the points gives a different polygon and a different limit.

## 2. Spectrum

$A$ is circulant, so the Fourier vectors $f_k(j) = e^{2\pi i jk/n}$ diagonalize it, with
$$\lambda_k = \tfrac12\big(1+\cos\tfrac{2\pi k}{n}\big) = \cos^2\tfrac{\pi k}{n},\qquad k=0,\dots,n-1.$$

- $\lambda_0 = 1$: the centroid mode $\mathbf 1$.
- $\lambda_{\pm1} = \cos^2(\pi/n)$: the dominant nontrivial eigenvalue, of multiplicity 2 for $n\ge 3$. Its real eigenspace is $\operatorname{span}\{\cos\theta_j,\ \sin\theta_j\}$ with $\theta_j = 2\pi j/n$.
- For $2\le k\le n-2$, $\lambda_k<\lambda_1$ (and $\lambda_{n/2}=0$ when $n$ is even).

Iterating $A$ alone sends every nonconstant mode to 0, so the polygon collapses to its centroid.

## 3. Normalized iteration and its limit

Center first, $X_0 = (I-\tfrac1n\mathbf 1\mathbf 1^\top)X$, then iterate $A/\lambda_1$. Scaling only the centred part keeps the centroid mode from growing like $\lambda_1^{-m}$. Then
$$\Big(\tfrac{A}{\lambda_1}\Big)^m X_0 \;\longrightarrow\; \tfrac{2}{n}C\,X_0,\qquad C_{ij} = \cos\tfrac{2\pi(i-j)}{n}.$$

Adding the centroid back gives the full limit operator
$$P = \tfrac1n\mathbf 1\mathbf 1^\top + \tfrac2n C,\qquad \operatorname{rank}P = 3,\quad \operatorname{col}(P)=\operatorname{span}\{\mathbf 1,\cos\theta,\sin\theta\}.$$

$P$ is the orthogonal projection onto Fourier modes $0,\pm1$. Explicitly,
$$y_j = (PX)_j = c + a\cos\theta_j + b\sin\theta_j,$$
$$c=\tfrac1n\textstyle\sum_l x_l,\quad a=\tfrac2n\sum_l x_l\cos\theta_l,\quad b=\tfrac2n\sum_l x_l\sin\theta_l .$$

**Result.** The limit is an **affine-regular $n$-gon**: it is planar (in $c+\operatorname{span}\{a,b\}$) and its vertices are equally spaced in parameter on the ellipse $c+a\cos t+b\sin t$. It is degenerate (a segment or a point) iff $a,b$ are linearly dependent.

**Rate.** The error decays like $\rho^m$ with
$$\rho = \lambda_2/\lambda_1 = \frac{\cos^2(2\pi/n)}{\cos^2(\pi/n)} \approx 1-\frac{3\pi^2}{n^2}.$$
Convergence is fast for small $n$ and slow for large $n$. In practice, apply $P$ directly; the iteration is not needed.

**History.** Darboux (1878) and Kasner treated the midpoint-polygon limit. Schoenberg (1950, *The finite Fourier series and elementary geometry*) and Berlekamp–Gilbert–Sinden (1965, *A polygon problem*) gave the Fourier treatment.

## 4. When does a rank-3 map give coplanar points?

Points $y_j$ (the rows of $Y$) lie on a common affine plane iff there is $(w,d)\neq 0$ with $Yw=d\,\mathbf 1$, that is, iff $\operatorname{rank}[\,Y\mid\mathbf 1\,]\le 3$.

**Proposition.** Let $P\in\mathbb{R}^{n\times n}$ have rank 3. Then $PX$ is coplanar for every $X\in\mathbb{R}^{n\times3}$ iff $\mathbf 1\in\operatorname{col}(P)$.

*Proof.* ($\Leftarrow$) Every column of $[\,PX\mid\mathbf 1\,]$ lies in the 3-dimensional space $\operatorname{col}(P)$, so its rank is at most 3. ($\Rightarrow$) Choose $X$ with $\operatorname{col}(PX)=\operatorname{col}(P)$. If $\mathbf 1\notin\operatorname{col}(P)$, then $\operatorname{rank}[\,PX\mid\mathbf 1\,]=4$. $\square$

A generic rank-3 matrix has a column space that misses $\mathbf 1$, so it does **not** give coplanar points. (A rank-$\le 2$ matrix always does, trivially: the points lie on a plane through the origin.)

**Template view.** Suppose $\operatorname{col}(P)=\operatorname{span}\{\mathbf 1,u,v\}$. Then every output has the form
$$y_j = c + a\,u_j + b\,v_j ,$$
an affine image of the fixed planar template $\{(u_j,v_j)\}\subset\mathbb{R}^2$. The input only selects the affine map $(c,a,b)$. The output shape depends only on $\operatorname{col}(P)$, not on the particular $P$.

- $(u,v)=(\cos k\theta,\sin k\theta)$ with $\gcd(k,n)=1$ gives the regular star polygon $\{n/k\}$; $k=1$ gives the convex $n$-gon.
- The midpoint iteration selects $k=1$ because $\lambda_1$ is the largest nontrivial eigenvalue.

## 5. Connection: polyhedra with affine-regular faces

From the earlier discussion of relaxing regular faces for convex polyhedra:

- Convex faces cost nothing (Steinitz).
- Stretching in one direction, combined with rotation and scaling, gives every affine map (SVD). So "stretched regular $n$-gon" means affine-regular.
- Affine-regular triangles are unrestricted. Affine-regular $2m$-gons are centrally symmetric, and a convex polyhedron whose faces are all centrally symmetric is a zonohedron. So an all-even-faced graph that is not zonohedral has no realization with affine-regular faces.
- Tangential faces (each face has an inscribed circle) exist for every polyhedral graph, via the Koebe–Andreev–Thurston midsphere.

The per-face operator $P_F$ from §3 is the projection of a face's vertex list onto the affine-regular polygons. This suggests an **alternating-projection scheme** (an idea, not tested): apply $P_F$ to each face independently, then reconcile each shared vertex, for example by averaging its copies across incident faces, and repeat. A fixed point is a realization with affine-regular faces. The zonohedron obstruction predicts that the scheme cannot converge to one for even-faced graphs that are not zonohedral. Convexity of the result is not guaranteed and would need a separate check.